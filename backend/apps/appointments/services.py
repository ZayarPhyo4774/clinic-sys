from django.db import transaction

from apps.appointments.models import Appointment, DoctorSchedule
from apps.appointments.scheduling import fits_schedule, local_bounds, next_available_slot
from apps.clinics.models import DoctorProfile
from apps.patients.models import Patient


def lock_doctor(doctor_id):
    return DoctorProfile.objects.select_for_update().get(pk=doctor_id)


def lock_visit(appointment_id) -> Appointment:
    """Lock the doctor, then the appointment, so concurrent visits cannot deadlock."""
    doctor_id = Appointment.objects.values_list("doctor_id", flat=True).get(pk=appointment_id)
    lock_doctor(doctor_id)
    return Appointment.objects.select_for_update().select_related(
        "patient",
        "doctor__staff",
        "branch__clinic",
        "schedule",
        "clinic",
    ).get(pk=appointment_id)


def matching_schedule(doctor, branch, starts_at, ends_at) -> DoctorSchedule:
    from django.core.exceptions import ValidationError

    start, _end = local_bounds(starts_at, ends_at, branch.clinic.timezone)
    schedules = DoctorSchedule.objects.filter(
        doctor=doctor,
        branch=branch,
        is_active=True,
        weekday=start.weekday(),
    )
    for schedule in schedules:
        if fits_schedule(schedule, starts_at, ends_at, branch.clinic.timezone):
            return schedule
    raise ValidationError({"starts_at": "Outside the doctor's schedule."})


def book_appointment(*, branch, patient, doctor, starts_at, ends_at, visit_reason="", created_by=None) -> Appointment:
    with transaction.atomic():
        lock_doctor(doctor.pk)
        Patient.objects.select_for_update().get(pk=patient.pk)
        schedule = matching_schedule(doctor, branch, starts_at, ends_at)
        appointment = Appointment(
            branch=branch,
            patient=patient,
            doctor=doctor,
            schedule=schedule,
            starts_at=starts_at,
            ends_at=ends_at,
            visit_reason=visit_reason or "",
            status=Appointment.Status.SCHEDULED,
            created_by=created_by,
        )
        appointment.save()
        return appointment


def reschedule_appointment(appointment_id, *, starts_at, ends_at) -> Appointment:
    from django.core.exceptions import ValidationError

    with transaction.atomic():
        appointment = lock_visit(appointment_id)
        Patient.objects.select_for_update().get(pk=appointment.patient_id)
        if appointment.status not in Appointment.RESCHEDULABLE:
            raise ValidationError({"starts_at": "This appointment can no longer be rescheduled."})
        appointment.schedule = matching_schedule(appointment.doctor, appointment.branch, starts_at, ends_at)
        appointment.starts_at = starts_at
        appointment.ends_at = ends_at
        appointment.save(update_fields=["schedule", "starts_at", "ends_at", "updated_at"])
        return appointment


def _set_status(appointment_id, status) -> Appointment:
    with transaction.atomic():
        appointment = lock_visit(appointment_id)
        appointment.status = status
        appointment.save(update_fields=["status", "updated_at"])
        return appointment


def confirm_appointment(appointment_id) -> Appointment:
    return _set_status(appointment_id, Appointment.Status.CONFIRMED)


def check_in_appointment(appointment_id) -> Appointment:
    return _set_status(appointment_id, Appointment.Status.CHECKED_IN)


def cancel_appointment(appointment_id) -> Appointment:
    return _set_status(appointment_id, Appointment.Status.CANCELLED)


def mark_no_show(appointment_id) -> Appointment:
    return _set_status(appointment_id, Appointment.Status.NO_SHOW)


def walk_in_patient(
    *,
    branch,
    patient,
    doctor,
    visit_reason="Walk-in",
    created_by=None,
    starts_at=None,
    ends_at=None,
) -> tuple[Appointment, object]:
    """Book the next slot, check the patient in, and add them to the queue."""
    from apps.queues.services import create_queue_entry

    with transaction.atomic():
        if starts_at is None or ends_at is None:
            starts_at, ends_at, _schedule = next_available_slot(doctor, branch, patient=patient)
        appointment = book_appointment(
            branch=branch,
            patient=patient,
            doctor=doctor,
            starts_at=starts_at,
            ends_at=ends_at,
            visit_reason=visit_reason or "Walk-in",
            created_by=created_by,
        )
        check_in_appointment(appointment.pk)
        entry = create_queue_entry(appointment.pk, created_by=created_by)
        appointment.refresh_from_db()
        return appointment, entry
