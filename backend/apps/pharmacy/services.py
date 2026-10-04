from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from zoneinfo import ZoneInfo

from apps.pharmacy.models import MedicineBatch, StockTransaction


def _today(batch):
    return timezone.now().astimezone(ZoneInfo(batch.branch.clinic.timezone)).date()


def apply_stock(*, batch, kind, direction, quantity, user, reason="", prescription_item=None):
    """Change one batch balance and append a ledger row in the same transaction."""
    try:
        with transaction.atomic():
            locked = (
                MedicineBatch.objects.select_for_update()
                .select_related("branch__clinic", "medicine")
                .get(pk=batch.pk)
            )
            if quantity < 1:
                raise ValidationError({"quantity": "Quantity must be at least 1."})
            if kind == StockTransaction.Kind.STOCK_IN:
                direction = StockTransaction.Direction.IN
            if kind == StockTransaction.Kind.DISPENSE:
                direction = StockTransaction.Direction.OUT
            if direction not in {StockTransaction.Direction.IN, StockTransaction.Direction.OUT}:
                raise ValidationError({"direction": "This field is required."})
            if not locked.is_active and (
                kind == StockTransaction.Kind.DISPENSE or direction == StockTransaction.Direction.IN
            ):
                raise ValidationError({"batch": "Batch is not active."})
            if kind in {StockTransaction.Kind.STOCK_IN, StockTransaction.Kind.DISPENSE} and not locked.medicine.is_active:
                raise ValidationError({"medicine": "Medicine is not active."})
            expired = locked.expiry_date < _today(locked)
            if expired and (kind == StockTransaction.Kind.DISPENSE or direction == StockTransaction.Direction.IN):
                raise ValidationError({"batch": "This batch is expired."})
            delta = quantity if direction == StockTransaction.Direction.IN else -quantity
            if locked.quantity_on_hand + delta < 0:
                raise ValidationError({"quantity": "Not enough stock."})
            locked.quantity_on_hand += delta
            locked._balance_update = True
            locked.save(update_fields=["quantity_on_hand", "updated_at"])
            entry = StockTransaction(
                batch=locked,
                kind=kind,
                direction=direction,
                quantity=quantity,
                reason=reason or "",
                prescription_item=prescription_item,
                recorded_by=user,
            )
            entry.save()
            return entry
    except IntegrityError as exc:
        raise ValidationError({"quantity": "Not enough stock."}) from exc
