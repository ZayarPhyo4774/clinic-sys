from django.db.models import Count

from apps.laboratory.models import LabOrder, LabOrderItem, LabResult
from apps.reports.services.common import clinic_meta, scope_branch


def _median_hours(orders) -> float | None:
    durations = []
    for order in orders.filter(reported_at__isnull=False).iterator():
        if order.created_at and order.reported_at:
            durations.append((order.reported_at - order.created_at).total_seconds() / 3600)
    if not durations:
        return None
    durations.sort()
    mid = len(durations) // 2
    if len(durations) % 2:
        return round(durations[mid], 1)
    return round((durations[mid - 1] + durations[mid]) / 2, 1)


def build_laboratory_report(*, clinic_id, branch_id, start, end) -> dict:
    meta = clinic_meta(clinic_id)

    orders = LabOrder.objects.filter(
        clinic_id=clinic_id,
        created_at__date__gte=start,
        created_at__date__lte=end,
    )
    results = LabResult.objects.filter(
        clinic_id=clinic_id,
        status=LabResult.Status.ACTIVE,
        recorded_at__date__gte=start,
        recorded_at__date__lte=end,
    )

    orders = scope_branch(orders, branch_id)
    results = scope_branch(results, branch_id)

    orders_by_status = {
        row["status"]: row["count"] for row in orders.values("status").annotate(count=Count("id"))
    }

    tests_by_volume = []
    for row in (
        LabOrderItem.objects.filter(order__in=orders)
        .values("lab_test_id", "lab_test__code", "lab_test__name")
        .annotate(count=Count("id"))
        .order_by("-count")[:15]
    ):
        tests_by_volume.append(
            {
                "lab_test_id": str(row["lab_test_id"]),
                "code": row["lab_test__code"],
                "name": row["lab_test__name"],
                "count": row["count"],
            }
        )

    total_results = results.count()
    abnormal = results.filter(interpretation__in=[LabResult.Interpretation.LOW, LabResult.Interpretation.HIGH]).count()
    abnormal_rate = round((abnormal / total_results) * 100, 1) if total_results else None

    interpretation_breakdown = {
        row["interpretation"] or "unspecified": row["count"]
        for row in results.values("interpretation").annotate(count=Count("id"))
    }

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        **meta,
        "order_count": orders.count(),
        "orders_by_status": orders_by_status,
        "completed_orders": orders_by_status.get(LabOrder.Status.COMPLETED, 0),
        "median_turnaround_hours": _median_hours(orders),
        "tests_by_volume": tests_by_volume,
        "result_count": total_results,
        "abnormal_result_count": abnormal,
        "abnormal_rate_percent": abnormal_rate,
        "interpretation_breakdown": interpretation_breakdown,
    }
