from datetime import timedelta

from django.db.models import Count, Sum
from django.utils import timezone

from apps.encounters.models import Diagnosis, Encounter, FollowUp
from apps.prescriptions.models import Prescription, PrescriptionItem
from apps.reports.services.common import clinic_meta, scope_branch


def _avg_consult_minutes(encounters) -> float | None:
    deltas = []
    for enc in encounters.filter(status=Encounter.Status.COMPLETED).iterator():
        if enc.started_at and enc.completed_at:
            deltas.append((enc.completed_at - enc.started_at).total_seconds() / 60)
    if not deltas:
        return None
    return round(sum(deltas) / len(deltas), 1)


def build_clinical_report(*, clinic_id, branch_id, start, end) -> dict:
    meta = clinic_meta(clinic_id)
    today = timezone.localdate()

    encounters = Encounter.objects.filter(
        clinic_id=clinic_id,
        started_at__date__gte=start,
        started_at__date__lte=end,
    )
    prescriptions = Prescription.objects.filter(
        clinic_id=clinic_id,
        created_at__date__gte=start,
        created_at__date__lte=end,
    )
    diagnoses = Diagnosis.objects.filter(
        clinic_id=clinic_id,
        status=Diagnosis.Status.ACTIVE,
        recorded_at__date__gte=start,
        recorded_at__date__lte=end,
    )
    follow_ups = FollowUp.objects.filter(clinic_id=clinic_id, status=FollowUp.Status.ACTIVE)

    encounters = scope_branch(encounters, branch_id)
    prescriptions = scope_branch(prescriptions, branch_id)
    diagnoses = scope_branch(diagnoses, branch_id)
    follow_ups = scope_branch(follow_ups, branch_id)

    encounters_by_status = {
        row["status"]: row["count"] for row in encounters.values("status").annotate(count=Count("id"))
    }
    prescriptions_by_status = {
        row["status"]: row["count"] for row in prescriptions.values("status").annotate(count=Count("id"))
    }

    top_diagnoses = []
    for row in (
        diagnoses.exclude(code="")
        .values("code", "description")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    ):
        top_diagnoses.append(
            {
                "code": row["code"],
                "description": row["description"],
                "count": row["count"],
            }
        )

    rx_items = PrescriptionItem.objects.filter(prescription__in=prescriptions)
    total_prescribed = rx_items.aggregate(qty=Sum("quantity"))["qty"] or 0
    total_dispensed = rx_items.aggregate(qty=Sum("quantity_dispensed"))["qty"] or 0
    fill_rate = round((total_dispensed / total_prescribed) * 100, 1) if total_prescribed else None

    follow_up_due_7 = follow_ups.filter(follow_up_on__gte=today, follow_up_on__lte=today + timedelta(days=7)).count()
    follow_up_due_30 = follow_ups.filter(follow_up_on__gte=today, follow_up_on__lte=today + timedelta(days=30)).count()

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        **meta,
        "encounter_count": encounters.count(),
        "encounters_by_status": encounters_by_status,
        "encounters_completed": encounters_by_status.get(Encounter.Status.COMPLETED, 0),
        "avg_consult_minutes": _avg_consult_minutes(encounters),
        "prescription_count": prescriptions.count(),
        "prescriptions_by_status": prescriptions_by_status,
        "prescription_items": rx_items.count(),
        "prescribed_quantity": total_prescribed,
        "dispensed_quantity": total_dispensed,
        "fill_rate_percent": fill_rate,
        "top_diagnoses": top_diagnoses,
        "follow_ups_due_7_days": follow_up_due_7,
        "follow_ups_due_30_days": follow_up_due_30,
    }
