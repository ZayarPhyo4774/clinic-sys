from datetime import timedelta

from django.db.models import Case, Count, F, IntegerField, Min, Q, Sum, When
from django.db.models.functions import Coalesce

from apps.pharmacy.models import Medicine, MedicineBatch, StockTransaction
from apps.reports.services.common import clinic_localdate, clinic_meta, scope_branch

KIND = StockTransaction.Kind
DIRECTION = StockTransaction.Direction
KIND_LABELS = dict(StockTransaction.Kind.choices)
REASON_LABELS = dict(StockTransaction.Reason.choices)


def _signed_quantity():
    return Case(
        When(direction=DIRECTION.IN, then=F("quantity")),
        default=-F("quantity"),
        output_field=IntegerField(),
    )


def _component(bucket: dict, kind: str, direction: str) -> int:
    return int(bucket.get((kind, direction), 0) or 0)


def _stock_status(remaining: int, reorder_level: int) -> str:
    if remaining <= 0:
        return "out_of_stock"
    if reorder_level and remaining <= reorder_level:
        return "low_stock"
    return "in_stock"


def build_pharmacy_report(*, clinic_id, branch_id, start, end) -> dict:
    meta = clinic_meta(clinic_id)
    today = clinic_localdate(clinic_id)

    batches = MedicineBatch.objects.filter(clinic_id=clinic_id, is_active=True, quantity_on_hand__gt=0)
    transactions = StockTransaction.objects.filter(clinic_id=clinic_id)
    batches = scope_branch(batches, branch_id)
    transactions = scope_branch(transactions, branch_id)

    period = transactions.filter(recorded_at__date__gte=start, recorded_at__date__lte=end)
    prior = transactions.filter(recorded_at__date__lt=start)

    opening_by_medicine = {
        row["medicine_id"]: int(row["net"] or 0)
        for row in prior.values("medicine_id").annotate(net=Coalesce(Sum(_signed_quantity()), 0))
    }
    components: dict[object, dict[tuple[str, str], int]] = {}
    for row in period.values("medicine_id", "kind", "direction").annotate(units=Sum("quantity")):
        components.setdefault(row["medicine_id"], {})[(row["kind"], row["direction"])] = int(row["units"] or 0)

    medicine_ids = set(opening_by_medicine) | set(components)
    medicines = Medicine.objects.filter(clinic_id=clinic_id).select_related("category")
    if branch_id is not None:
        stocked_here = MedicineBatch.objects.filter(branch_id=branch_id).values("medicine_id")
        medicines = medicines.filter(Q(id__in=medicine_ids) | Q(is_active=True, id__in=stocked_here))
    else:
        medicines = medicines.filter(Q(is_active=True) | Q(id__in=medicine_ids))

    batch_stats = {
        row["medicine_id"]: row
        for row in batches.values("medicine_id").annotate(
            batch_count=Count("id"),
            nearest=Min("expiry_date"),
        )
    }

    ledger = []
    totals = {
        "opening_balance": 0,
        "received": 0,
        "used": 0,
        "adjustment_in": 0,
        "adjustment_out": 0,
        "transfer_in": 0,
        "transfer_out": 0,
        "remaining_balance": 0,
    }
    for medicine in medicines.order_by("name"):
        bucket = components.get(medicine.id, {})
        opening = opening_by_medicine.get(medicine.id, 0)
        received = _component(bucket, KIND.STOCK_IN, DIRECTION.IN)
        used = _component(bucket, KIND.DISPENSE, DIRECTION.OUT)
        adjustment_in = _component(bucket, KIND.ADJUSTMENT, DIRECTION.IN)
        adjustment_out = _component(bucket, KIND.ADJUSTMENT, DIRECTION.OUT)
        transfer_in = _component(bucket, KIND.TRANSFER, DIRECTION.IN)
        transfer_out = _component(bucket, KIND.TRANSFER, DIRECTION.OUT)
        remaining = (
            opening + received + adjustment_in + transfer_in - used - adjustment_out - transfer_out
        )
        stats = batch_stats.get(medicine.id, {})
        nearest = stats.get("nearest")
        row = {
            "medicine_id": str(medicine.id),
            "medicine_code": medicine.code,
            "medicine_name": medicine.name,
            "strength": medicine.strength,
            "category": medicine.category.name if medicine.category_id else "",
            "unit": medicine.unit,
            "opening_balance": opening,
            "received": received,
            "used": used,
            "adjustment_in": adjustment_in,
            "adjustment_out": adjustment_out,
            "transfer_in": transfer_in,
            "transfer_out": transfer_out,
            "remaining_balance": remaining,
            "reorder_level": medicine.reorder_level,
            "status": _stock_status(remaining, medicine.reorder_level),
            "batch_count": stats.get("batch_count") or 0,
            "nearest_expiry": nearest.isoformat() if nearest else None,
        }
        ledger.append(row)
        for key in totals:
            totals[key] += row[key]

    low_stock = [
        {
            "medicine_id": row["medicine_id"],
            "medicine_code": row["medicine_code"],
            "medicine_name": row["medicine_name"],
            "quantity_on_hand": row["remaining_balance"],
            "reorder_level": row["reorder_level"],
            "used": row["used"],
            "status": row["status"],
        }
        for row in ledger
        if row["status"] != "in_stock"
    ]

    dispense_by_medicine = [
        {
            "medicine_id": row["medicine_id"],
            "code": row["medicine_code"],
            "name": row["medicine_name"],
            "units": row["used"],
        }
        for row in sorted(ledger, key=lambda item: item["used"], reverse=True)
        if row["used"] > 0
    ]

    expiring_30 = batches.filter(expiry_date__lte=today + timedelta(days=30), expiry_date__gte=today)
    expiring_60 = batches.filter(
        expiry_date__lte=today + timedelta(days=60),
        expiry_date__gt=today + timedelta(days=30),
    )
    expiring_90 = batches.filter(
        expiry_date__lte=today + timedelta(days=90),
        expiry_date__gt=today + timedelta(days=60),
    )

    adjustments = period.filter(kind=KIND.ADJUSTMENT)
    adjustments_by_reason = {
        row["reason"] or "unspecified": row["count"]
        for row in adjustments.values("reason").annotate(count=Count("id"))
    }

    on_hand_by_medicine = [
        {
            "medicine_id": row["medicine_id"],
            "medicine_code": row["medicine_code"],
            "medicine_name": row["medicine_name"],
            "unit": row["unit"],
            "quantity_on_hand": row["remaining_balance"],
            "reorder_level": row["reorder_level"],
            "batch_count": row["batch_count"],
            "nearest_expiry": row["nearest_expiry"],
        }
        for row in ledger
    ]

    batch_register = []
    for batch in batches.select_related("medicine", "branch", "supplier").order_by("expiry_date", "medicine__name"):
        batch_register.append(
            {
                "batch_id": str(batch.id),
                "batch_number": batch.batch_number,
                "medicine_code": batch.medicine.code,
                "medicine_name": batch.medicine.name,
                "branch_name": batch.branch.name,
                "branch_role": batch.branch.inventory_role,
                "quantity_on_hand": batch.quantity_on_hand,
                "expiry_date": batch.expiry_date.isoformat(),
                "supplier_name": batch.supplier.name if batch.supplier_id else "",
            }
        )

    movement_lines = []
    for txn in period.select_related("medicine", "batch", "branch", "recorded_by").order_by("recorded_at", "id"):
        signed = txn.quantity if txn.direction == DIRECTION.IN else -txn.quantity
        movement_lines.append(
            {
                "recorded_at": txn.recorded_at.isoformat(),
                "medicine_code": txn.medicine.code,
                "medicine_name": txn.medicine.name,
                "batch_number": txn.batch.batch_number,
                "branch_name": txn.branch.name,
                "kind": txn.kind,
                "kind_label": KIND_LABELS.get(txn.kind, txn.kind),
                "direction": txn.direction,
                "quantity": txn.quantity,
                "signed_quantity": signed,
                "reason": REASON_LABELS.get(txn.reason, txn.reason or ""),
                "recorded_by": txn.recorded_by.full_name if txn.recorded_by_id else "",
            }
        )

    inventory_by_role = {}
    for role, label in (
        ("store", "Store"),
        ("dispensary", "Dispensary"),
        ("both", "Store and dispensary"),
    ):
        role_batches = batches.filter(branch__inventory_role=role)
        inventory_by_role[role] = {
            "label": label,
            "units_on_hand": role_batches.aggregate(total=Sum("quantity_on_hand"))["total"] or 0,
            "batch_count": role_batches.count(),
        }

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        **meta,
        "medicines_tracked": medicines.count(),
        "total_units_on_hand": totals["remaining_balance"],
        "total_used": totals["used"],
        "low_stock_items": low_stock[:20],
        "low_stock_count": len(low_stock),
        "expiring_within_30_days": expiring_30.aggregate(units=Sum("quantity_on_hand"))["units"] or 0,
        "expiring_within_60_days": expiring_60.aggregate(units=Sum("quantity_on_hand"))["units"] or 0,
        "expiring_within_90_days": expiring_90.aggregate(units=Sum("quantity_on_hand"))["units"] or 0,
        "dispense_by_medicine": dispense_by_medicine,
        "movement_summary": {
            "stock_in_units": totals["received"],
            "dispense_units": totals["used"],
            "used_units": totals["used"],
            "adjustment_units": totals["adjustment_in"] + totals["adjustment_out"],
            "adjustment_in_units": totals["adjustment_in"],
            "adjustment_out_units": totals["adjustment_out"],
            "transfer_in_units": totals["transfer_in"],
            "transfer_out_units": totals["transfer_out"],
        },
        "adjustments_by_reason": adjustments_by_reason,
        "inventory_ledger": ledger,
        "ledger_totals": totals,
        "movement_lines": movement_lines,
        "on_hand_by_medicine": on_hand_by_medicine,
        "batch_register": batch_register,
        "inventory_by_role": inventory_by_role,
    }
