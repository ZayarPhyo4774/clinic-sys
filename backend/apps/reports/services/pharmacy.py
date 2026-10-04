from datetime import timedelta

from django.db.models import Count, Sum
from django.utils import timezone

from apps.pharmacy.models import Medicine, MedicineBatch, StockTransaction
from apps.reports.services.common import clinic_meta, scope_branch


def build_pharmacy_report(*, clinic_id, branch_id, start, end) -> dict:
    meta = clinic_meta(clinic_id)
    today = timezone.localdate()

    batches = MedicineBatch.objects.filter(clinic_id=clinic_id, is_active=True, quantity_on_hand__gt=0)
    medicines = Medicine.objects.filter(clinic_id=clinic_id, is_active=True)
    transactions = StockTransaction.objects.filter(
        clinic_id=clinic_id,
        recorded_at__date__gte=start,
        recorded_at__date__lte=end,
    )

    batches = scope_branch(batches, branch_id)
    transactions = scope_branch(transactions, branch_id)
    if branch_id is not None:
        medicines = medicines.filter(batches__branch_id=branch_id).distinct()

    low_stock = []
    for medicine in medicines.iterator():
        on_hand = (
            batches.filter(medicine_id=medicine.id).aggregate(total=Sum("quantity_on_hand"))["total"] or 0
        )
        if on_hand <= medicine.reorder_level:
            low_stock.append(
                {
                    "medicine_id": str(medicine.id),
                    "medicine_code": medicine.code,
                    "medicine_name": medicine.name,
                    "quantity_on_hand": on_hand,
                    "reorder_level": medicine.reorder_level,
                }
            )

    expiring_30 = batches.filter(expiry_date__lte=today + timedelta(days=30), expiry_date__gte=today)
    expiring_60 = batches.filter(expiry_date__lte=today + timedelta(days=60), expiry_date__gt=today + timedelta(days=30))
    expiring_90 = batches.filter(expiry_date__lte=today + timedelta(days=90), expiry_date__gt=today + timedelta(days=60))

    dispense = transactions.filter(kind=StockTransaction.Kind.DISPENSE)
    stock_in = transactions.filter(kind=StockTransaction.Kind.STOCK_IN)
    adjustments = transactions.filter(kind=StockTransaction.Kind.ADJUSTMENT)

    dispense_by_medicine = []
    for row in (
        dispense.values("medicine_id", "medicine__code", "medicine__name")
        .annotate(units=Sum("quantity"))
        .order_by("-units")[:15]
    ):
        dispense_by_medicine.append(
            {
                "medicine_id": str(row["medicine_id"]),
                "code": row["medicine__code"],
                "name": row["medicine__name"],
                "units": row["units"],
            }
        )

    movement_summary = {
        "stock_in_units": stock_in.aggregate(total=Sum("quantity"))["total"] or 0,
        "dispense_units": dispense.aggregate(total=Sum("quantity"))["total"] or 0,
        "adjustment_units": adjustments.aggregate(total=Sum("quantity"))["total"] or 0,
    }

    adjustments_by_reason = {
        row["reason"] or "unspecified": row["count"]
        for row in adjustments.values("reason").annotate(count=Count("id"))
    }

    total_on_hand = batches.aggregate(total=Sum("quantity_on_hand"))["total"] or 0

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        **meta,
        "medicines_tracked": medicines.count(),
        "total_units_on_hand": total_on_hand,
        "low_stock_items": low_stock[:20],
        "low_stock_count": len(low_stock),
        "expiring_within_30_days": expiring_30.aggregate(units=Sum("quantity_on_hand"))["units"] or 0,
        "expiring_within_60_days": expiring_60.aggregate(units=Sum("quantity_on_hand"))["units"] or 0,
        "expiring_within_90_days": expiring_90.aggregate(units=Sum("quantity_on_hand"))["units"] or 0,
        "dispense_by_medicine": dispense_by_medicine,
        "movement_summary": movement_summary,
        "adjustments_by_reason": adjustments_by_reason,
    }
