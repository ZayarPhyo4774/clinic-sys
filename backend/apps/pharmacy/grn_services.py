from __future__ import annotations

from datetime import date
from typing import Any
from uuid import uuid4

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.clinics.models import Branch
from apps.pharmacy.models import GoodsReceiptLine, GoodsReceiptNote, Medicine, MedicineBatch, StockTransaction, Supplier, slug_code
from apps.pharmacy.services import apply_stock, transfer_stock


def _branch_can_receive(branch: Branch) -> bool:
    return branch.inventory_role in {Branch.InventoryRole.STORE, Branch.InventoryRole.BOTH}


def _branch_can_dispense(branch: Branch) -> bool:
    return branch.inventory_role in {Branch.InventoryRole.DISPENSARY, Branch.InventoryRole.BOTH}


def receive_stock_line(
    *,
    branch: Branch,
    user,
    medicine: Medicine,
    batch_number: str,
    expiry_date: date,
    quantity: int,
    supplier: Supplier | None = None,
    grn_line: GoodsReceiptLine | None = None,
) -> MedicineBatch:
    if quantity < 1:
        raise ValidationError({"quantity": "Quantity must be at least 1."})
    if not _branch_can_receive(branch):
        raise ValidationError({"branch": "This branch cannot receive stock."})
    if not medicine.is_active:
        raise ValidationError({"medicine": "Medicine is not active."})

    batch_number = (batch_number or "").strip()
    if not batch_number:
        raise ValidationError({"batch_number": "Batch number is required."})

    with transaction.atomic():
        batch = MedicineBatch.objects.filter(
            branch_id=branch.id,
            medicine_id=medicine.id,
            batch_number=batch_number,
        ).first()
        if batch is None:
            batch = MedicineBatch.objects.create(
                branch=branch,
                medicine=medicine,
                supplier=supplier,
                batch_number=batch_number,
                expiry_date=expiry_date,
                created_by=user,
            )
            if quantity:
                apply_stock(
                    batch=batch,
                    kind=StockTransaction.Kind.STOCK_IN,
                    direction=StockTransaction.Direction.IN,
                    quantity=quantity,
                    user=user,
                    grn_line=grn_line,
                )
        else:
            if batch.expiry_date != expiry_date:
                raise ValidationError({"batch_number": "Batch number already exists with a different expiry date."})
            apply_stock(
                batch=batch,
                kind=StockTransaction.Kind.STOCK_IN,
                direction=StockTransaction.Direction.IN,
                quantity=quantity,
                user=user,
                grn_line=grn_line,
            )
        batch.refresh_from_db()
        return batch


def create_grn(
    *,
    branch: Branch,
    user,
    received_at: date,
    supplier: Supplier | None = None,
    reference_number: str = "",
    notes: str = "",
) -> GoodsReceiptNote:
    if not user.clinic_id or branch.clinic_id != user.clinic_id:
        raise ValidationError({"branch": "Branch is outside this clinic."})
    if not _branch_can_receive(branch):
        raise ValidationError({"branch": "Select a store branch for GRN receiving."})
    reference_number = (reference_number or "").strip()
    if reference_number:
        conflict = GoodsReceiptNote.objects.filter(branch_id=branch.id, reference_number=reference_number).exists()
        if conflict:
            raise ValidationError({"reference_number": "This GRN reference already exists for the branch."})
    return GoodsReceiptNote.objects.create(
        clinic_id=branch.clinic_id,
        branch=branch,
        supplier=supplier,
        reference_number=reference_number,
        received_at=received_at,
        notes=(notes or "").strip(),
        created_by=user,
    )


def add_grn_line(
    *,
    grn: GoodsReceiptNote,
    medicine: Medicine,
    batch_number: str,
    expiry_date: date,
    quantity: int,
) -> GoodsReceiptLine:
    if grn.status != GoodsReceiptNote.Status.DRAFT:
        raise ValidationError({"status": "Only draft GRNs can be edited."})
    if medicine.clinic_id != grn.clinic_id:
        raise ValidationError({"medicine": "Medicine is outside this clinic."})
    if quantity < 1:
        raise ValidationError({"quantity": "Quantity must be at least 1."})
    return GoodsReceiptLine.objects.create(
        grn=grn,
        medicine=medicine,
        batch_number=(batch_number or "").strip(),
        expiry_date=expiry_date,
        quantity=quantity,
    )


def post_grn(*, grn: GoodsReceiptNote, user) -> GoodsReceiptNote:
    if grn.status != GoodsReceiptNote.Status.DRAFT:
        raise ValidationError({"status": "GRN is already posted."})
    lines = list(grn.lines.select_related("medicine"))
    if not lines:
        raise ValidationError({"lines": "Add at least one line before posting."})

    with transaction.atomic():
        locked = GoodsReceiptNote.objects.select_for_update().get(pk=grn.pk)
        if locked.status != GoodsReceiptNote.Status.DRAFT:
            raise ValidationError({"status": "GRN is already posted."})
        for line in lines:
            batch = receive_stock_line(
                branch=locked.branch,
                user=user,
                medicine=line.medicine,
                batch_number=line.batch_number,
                expiry_date=line.expiry_date,
                quantity=line.quantity,
                supplier=locked.supplier,
                grn_line=line,
            )
            GoodsReceiptLine.objects.filter(pk=line.pk).update(batch=batch)
        locked.status = GoodsReceiptNote.Status.POSTED
        locked.posted_at = timezone.now()
        locked.posted_by = user
        locked.save(update_fields=["status", "posted_at", "posted_by", "updated_at"])
        return locked


def bulk_receive_stock(
    *,
    branch: Branch,
    user,
    rows: list[dict[str, str]],
    supplier: Supplier | None = None,
    reference_number: str = "",
) -> dict[str, Any]:
    created = 0
    updated = 0
    errors: list[dict[str, Any]] = []
    medicine_cache: dict[str, Medicine] = {}

    for index, row in enumerate(rows, start=2):
        medicine_code = slug_code(row.get("medicine_code", ""))
        try:
            medicine = medicine_cache.get(medicine_code)
            if medicine is None:
                medicine = Medicine.objects.filter(clinic_id=branch.clinic_id, code=medicine_code).first()
                if medicine is None:
                    raise ValidationError(f"Unknown medicine code: {medicine_code}.")
                medicine_cache[medicine_code] = medicine

            quantity = int(row.get("quantity", "0"))
            expiry_raw = (row.get("expiry_date") or "").strip()
            expiry_date = date.fromisoformat(expiry_raw)
            batch_number = (row.get("batch_number") or "").strip()
            if not batch_number:
                raise ValidationError("Batch number is required.")

            existed = MedicineBatch.objects.filter(
                branch_id=branch.id,
                medicine_id=medicine.id,
                batch_number=batch_number,
            ).exists()
            receive_stock_line(
                branch=branch,
                user=user,
                medicine=medicine,
                batch_number=batch_number,
                expiry_date=expiry_date,
                quantity=quantity,
                supplier=supplier,
            )
            if existed:
                updated += 1
            else:
                created += 1
        except (ValidationError, ValueError) as exc:
            if getattr(exc, "error_dict", None):
                message = "; ".join(
                    f"{field}: {error}" for field, errors in exc.error_dict.items() for error in errors
                )
            elif getattr(exc, "messages", None):
                message = exc.messages[0]
            else:
                message = str(exc)
            errors.append({"row": index, "medicine_code": medicine_code or None, "message": message})

    return {
        "created": created,
        "updated": updated,
        "reference_number": reference_number,
        "errors": errors,
    }


def issue_transfer(
    *,
    source_batch: MedicineBatch,
    destination_branch: Branch,
    quantity: int,
    user,
) -> dict[str, Any]:
    return transfer_stock(
        source_batch=source_batch,
        destination_branch=destination_branch,
        quantity=quantity,
        user=user,
        transfer_group=uuid4(),
    )
