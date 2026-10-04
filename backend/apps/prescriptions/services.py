from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from zoneinfo import ZoneInfo

from apps.pharmacy.models import MedicineBatch, StockTransaction
from apps.pharmacy.services import apply_stock
from apps.prescriptions.models import Prescription, PrescriptionItem


def cancel_prescription(prescription_id) -> Prescription:
    with transaction.atomic():
        prescription = Prescription.objects.select_for_update().get(pk=prescription_id)
        if prescription.status != Prescription.Status.ACTIVE:
            raise ValidationError({"status": "This status change is not allowed."})
        if prescription.items.filter(quantity_dispensed__gt=0).exists():
            raise ValidationError({"status": "This status change is not allowed."})
        prescription.status = Prescription.Status.CANCELLED
        prescription.save(update_fields=["status", "updated_at"])
        return prescription


def _refresh_status(prescription: Prescription) -> Prescription:
    items = list(prescription.items.all())
    if not items:
        return prescription
    if all(item.quantity_dispensed >= item.quantity for item in items):
        prescription.status = Prescription.Status.DISPENSED
    elif any(item.quantity_dispensed > 0 for item in items):
        prescription.status = Prescription.Status.PARTIALLY_DISPENSED
    prescription.save(update_fields=["status", "updated_at"])
    return prescription


def dispense_item(*, item_id, batch_id, quantity, user) -> StockTransaction:
    try:
        with transaction.atomic():
            item = PrescriptionItem.objects.select_related("prescription").get(pk=item_id)
            prescription = Prescription.objects.select_for_update().get(pk=item.prescription_id)
            item = PrescriptionItem.objects.select_for_update().select_related("medicine").get(pk=item_id)
            if prescription.status not in Prescription.OPENABLE:
                raise ValidationError({"status": "This status change is not allowed."})
            remaining = item.quantity - item.quantity_dispensed
            if quantity > remaining:
                raise ValidationError({"quantity": "Quantity is greater than the remaining prescription."})
            batch = (
                MedicineBatch.objects.select_for_update()
                .select_related("branch__clinic", "medicine")
                .get(pk=batch_id)
            )
            if batch.branch_id != prescription.branch_id or batch.clinic_id != prescription.clinic_id:
                raise ValidationError({"batch": "Batch is not at this branch."})
            if batch.medicine_id != item.medicine_id:
                raise ValidationError({"batch": "Batch is for a different medicine."})
            if not batch.is_active:
                raise ValidationError({"batch": "Batch is not active."})
            if not batch.medicine.is_active or not item.medicine.is_active:
                raise ValidationError({"medicine": "Medicine is not active."})
            today = timezone.now().astimezone(ZoneInfo(batch.branch.clinic.timezone)).date()
            if batch.expiry_date < today:
                raise ValidationError({"batch": "This batch is expired."})
            if batch.quantity_on_hand < quantity:
                raise ValidationError({"quantity": "Not enough stock."})
            entry = apply_stock(
                batch=batch,
                kind=StockTransaction.Kind.DISPENSE,
                direction=StockTransaction.Direction.OUT,
                quantity=quantity,
                user=user,
                prescription_item=item,
            )
            item.quantity_dispensed += quantity
            item._dispense_update = True
            item.save(update_fields=["quantity_dispensed", "updated_at"])
            _refresh_status(prescription)
            return entry
    except IntegrityError as exc:
        raise ValidationError({"quantity": "Not enough stock."}) from exc
