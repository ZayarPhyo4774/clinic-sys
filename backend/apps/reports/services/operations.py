from django.db.models import Count
from django.db.models.functions import ExtractHour

from apps.appointments.models import Appointment
from apps.encounters.models import Encounter
from apps.patients.models import Patient
from apps.queues.models import QueueEntry
from apps.reports.services.common import clinic_meta, scope_branch


def _avg_minutes(entries, start_field: str, end_field: str) -> float | None:
    deltas = []
    for entry in entries.iterator():
        start = getattr(entry, start_field, None)
        end = getattr(entry, end_field, None)
        if start and end:
            deltas.append((end - start).total_seconds() / 60)
    if not deltas:
        return None
    return round(sum(deltas) / len(deltas), 1)


def build_operations_report(*, clinic_id, branch_id, start, end) -> dict:
    meta = clinic_meta(clinic_id)

    appointments = Appointment.objects.filter(
        clinic_id=clinic_id,
        starts_at__date__gte=start,
        starts_at__date__lte=end,
    )
    queue_entries = QueueEntry.objects.filter(
        clinic_id=clinic_id,
        service_date__gte=start,
        service_date__lte=end,
    )
    encounters = Encounter.objects.filter(
        clinic_id=clinic_id,
        started_at__date__gte=start,
        started_at__date__lte=end,
    )
    new_patients = Patient.objects.filter(
        clinic_id=clinic_id,
        created_at__date__gte=start,
        created_at__date__lte=end,
    )

    appointments = scope_branch(appointments, branch_id)
    queue_entries = scope_branch(queue_entries, branch_id)
    encounters = scope_branch(encounters, branch_id)
    new_patients = scope_branch(new_patients, branch_id)

    total_appointments = appointments.count()
    walk_in_count = appointments.filter(visit_reason__icontains="walk-in").count()
    scheduled_count = max(total_appointments - walk_in_count, 0)
    no_show_count = appointments.filter(status=Appointment.Status.NO_SHOW).count()
    cancelled_count = appointments.filter(status=Appointment.Status.CANCELLED).count()
    completed_appointments = appointments.filter(status=Appointment.Status.COMPLETED).count()

    no_show_rate = round((no_show_count / total_appointments) * 100, 1) if total_appointments else 0

    appointments_by_status = {
        row["status"]: row["count"] for row in appointments.values("status").annotate(count=Count("id"))
    }
    queue_by_status = {
        row["status"]: row["count"] for row in queue_entries.values("status").annotate(count=Count("id"))
    }

    encounter_patients = set(encounters.values_list("patient_id", flat=True))
    completed_appt_patients = set(
        appointments.filter(status=Appointment.Status.COMPLETED).values_list("patient_id", flat=True)
    )
    patients_seen = len(encounter_patients | completed_appt_patients)

    wait_entries = queue_entries.exclude(started_at__isnull=True).exclude(called_at__isnull=True)
    service_entries = queue_entries.exclude(completed_at__isnull=True).exclude(started_at__isnull=True)

    peak_hours = {
        str(row["hour"]): row["count"]
        for row in appointments.annotate(hour=ExtractHour("starts_at")).values("hour").annotate(count=Count("id"))
    }

    demographics = {
        row["sex"]: row["count"]
        for row in Patient.objects.filter(
            clinic_id=clinic_id,
            is_active=True,
            **({"branch_id": branch_id} if branch_id else {}),
        )
        .values("sex")
        .annotate(count=Count("id"))
    }

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        **meta,
        "appointment_count": total_appointments,
        "appointments_by_status": appointments_by_status,
        "walk_in_count": walk_in_count,
        "scheduled_count": scheduled_count,
        "no_show_count": no_show_count,
        "cancellation_count": cancelled_count,
        "completed_appointments": completed_appointments,
        "no_show_rate": no_show_rate,
        "queue_count": queue_entries.count(),
        "queue_by_status": queue_by_status,
        "queue_skipped": queue_by_status.get(QueueEntry.Status.SKIPPED, 0),
        "queue_cancelled": queue_by_status.get(QueueEntry.Status.CANCELLED, 0),
        "avg_wait_minutes": _avg_minutes(wait_entries, "called_at", "started_at"),
        "avg_service_minutes": _avg_minutes(service_entries, "started_at", "completed_at"),
        "patients_seen": patients_seen,
        "encounters_started": encounters.count(),
        "encounters_completed": encounters.filter(status=Encounter.Status.COMPLETED).count(),
        "new_patients": new_patients.count(),
        "peak_appointment_hours": peak_hours,
        "demographics_by_sex": demographics,
    }
