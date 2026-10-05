from uuid import UUID

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from zoneinfo import ZoneInfo

from apps.clinics.models import Branch
from apps.pharmacy.models import MedicineBatch, StockTransaction


def _today(batch):
    return timezone.now().astimezone(ZoneInfo(batch.branch.clinic.timezone)).date()


def apply_stock(
    *,
    batch,
    kind,
    direction,
    quantity,
    user,
    reason="",
    prescription_item=None,
    grn_line=None,
    transfer_group: UUID | None = None,
):
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
            if kind == StockTransaction.Kind.TRANSFER and direction is None:
                raise ValidationError({"direction": "Transfer direction is required."})
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
                reason=reason or (StockTransaction.Reason.TRANSFER if kind == StockTransaction.Kind.TRANSFER else ""),
                prescription_item=prescription_item,
                grn_line=grn_line,
                transfer_group=transfer_group,
                recorded_by=user,
            )
            entry.save()
            return entry
    except IntegrityError as exc:
        raise ValidationError({"quantity": "Not enough stock."}) from exc


def transfer_stock(*, source_batch, destination_branch: Branch, quantity: int, user, transfer_group: UUID):
    if quantity < 1:
        raise ValidationError({"quantity": "Quantity must be at least 1."})
    if source_batch.branch_id == destination_branch.id:
        raise ValidationError({"destination_branch": "Choose a different branch."})
    source_role = source_batch.branch.inventory_role
    dest_role = destination_branch.inventory_role
    if source_role not in {Branch.InventoryRole.STORE, Branch.InventoryRole.BOTH}:
        raise ValidationError({"batch": "Transfers must start from a store branch."})
    if dest_role not in {Branch.InventoryRole.DISPENSARY, Branch.InventoryRole.BOTH}:
        raise ValidationError({"destination_branch": "Transfers must go to a dispensary branch."})

    with transaction.atomic():
        out_entry = apply_stock(
            batch=source_batch,
            kind=StockTransaction.Kind.TRANSFER,
            direction=StockTransaction.Direction.OUT,
            quantity=quantity,
            user=user,
            transfer_group=transfer_group,
        )
        destination_batch = MedicineBatch.objects.filter(
            branch_id=destination_branch.id,
            medicine_id=source_batch.medicine_id,
            batch_number=source_batch.batch_number,
        ).first()
        if destination_batch is None:
            destination_batch = MedicineBatch.objects.create(
                branch=destination_branch,
                medicine=source_batch.medicine,
                supplier=source_batch.supplier,
                batch_number=source_batch.batch_number,
                expiry_date=source_batch.expiry_date,
                created_by=user,
            )
        in_entry = apply_stock(
            batch=destination_batch,
            kind=StockTransaction.Kind.TRANSFER,
            direction=StockTransaction.Direction.IN,
            quantity=quantity,
            user=user,
            transfer_group=transfer_group,
        )
        destination_batch.refresh_from_db()
        return {
            "transfer_group": str(transfer_group),
            "source_batch_id": str(source_batch.id),
            "destination_batch_id": str(destination_batch.id),
            "out_transaction_id": str(out_entry.id),
            "in_transaction_id": str(in_entry.id),
            "destination_quantity_on_hand": destination_batch.quantity_on_hand,
        }
