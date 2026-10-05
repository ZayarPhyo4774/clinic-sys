from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Max
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.appointments.services import lock_visit
from apps.encounters.services import begin_consultation_phase, start_triage_encounter
from apps.queues.models import QueueEntry


def _lock_entry(entry_id):
    appointment_id = QueueEntry.objects.values_list("appointment_id", flat=True).get(pk=entry_id)
    appointment = lock_visit(appointment_id)
    entry = QueueEntry.objects.select_for_update().get(pk=entry_id)
    return entry, appointment


def _reject():
    raise ValidationError({"status": "This status change is not allowed."})


def create_queue_entry(appointment_id, *, created_by=None) -> QueueEntry:
    with transaction.atomic():
        appointment = lock_visit(appointment_id)
        if appointment.status != Appointment.Status.CHECKED_IN:
            raise ValidationError({"appointment": "Check the patient in before queueing."})
        if QueueEntry.objects.filter(appointment_id=appointment.pk).exists():
            raise ValidationError({"appointment": "This appointment is already in the queue."})
        from apps.appointments.scheduling import local_bounds

        start, _end = local_bounds(appointment.starts_at, appointment.ends_at, appointment.branch.clinic.timezone)
        current = QueueEntry.objects.select_for_update().filter(
            branch_id=appointment.branch_id,
            doctor_id=appointment.doctor_id,
            service_date=start.date(),
        ).aggregate(highest=Max("position"))
        entry = QueueEntry(
            appointment=appointment,
            position=(current["highest"] or 0) + 1,
            status=QueueEntry.Status.WAITING,
            created_by=created_by,
        )
        entry.save()
        appointment.status = Appointment.Status.IN_QUEUE
        appointment.save(update_fields=["status", "updated_at"])
        return entry


def start_triage(entry_id, user):
    with transaction.atomic():
        entry, appointment = _lock_entry(entry_id)
        if entry.status != QueueEntry.Status.WAITING:
            raise ValidationError({"status": "Triage can only start while the patient is waiting."})
        if appointment.status != Appointment.Status.IN_QUEUE:
            _reject()
        start_triage_encounter(appointment.pk, user)
        if entry.triage_started_at is None:
            entry.triage_started_at = timezone.now()
            entry.save(update_fields=["triage_started_at", "updated_at"])
        return entry


def call_queue_entry(entry_id) -> QueueEntry:
    with transaction.atomic():
        entry, appointment = _lock_entry(entry_id)
        if entry.status != QueueEntry.Status.WAITING or appointment.status != Appointment.Status.IN_QUEUE:
            _reject()
        busy = QueueEntry.objects.select_for_update().filter(
            branch_id=entry.branch_id,
            doctor_id=entry.doctor_id,
            service_date=entry.service_date,
            status__in=[QueueEntry.Status.CALLED, QueueEntry.Status.IN_SERVICE],
        ).exclude(pk=entry.pk)
        if busy.exists():
            raise ValidationError({"status": "Another patient is already with this doctor."})
        entry.status = QueueEntry.Status.CALLED
        entry.called_at = timezone.now()
        entry.save(update_fields=["status", "called_at", "updated_at"])
        return entry


def start_consultation(entry_id, *, user) -> QueueEntry:
    with transaction.atomic():
        entry, appointment = _lock_entry(entry_id)
        if entry.status != QueueEntry.Status.CALLED or appointment.status != Appointment.Status.IN_QUEUE:
            _reject()
        appointment.status = Appointment.Status.IN_CONSULTATION
        appointment.save(update_fields=["status", "updated_at"])
        entry.status = QueueEntry.Status.IN_SERVICE
        entry.started_at = timezone.now()
        entry.save(update_fields=["status", "started_at", "updated_at"])
        begin_consultation_phase(appointment.pk, user)
        return entry


def complete_consultation(entry_id) -> QueueEntry:
    with transaction.atomic():
        entry, appointment = _lock_entry(entry_id)
        if entry.status != QueueEntry.Status.IN_SERVICE or appointment.status != Appointment.Status.IN_CONSULTATION:
            _reject()
        appointment.status = Appointment.Status.COMPLETED
        appointment.save(update_fields=["status", "updated_at"])
        entry.status = QueueEntry.Status.COMPLETED
        entry.completed_at = timezone.now()
        entry.save(update_fields=["status", "completed_at", "updated_at"])
        return entry


def skip_queue_entry(entry_id) -> QueueEntry:
    with transaction.atomic():
        entry, appointment = _lock_entry(entry_id)
        if appointment.status != Appointment.Status.IN_QUEUE or entry.status not in {
            QueueEntry.Status.WAITING,
            QueueEntry.Status.CALLED,
        }:
            _reject()
        entry.status = QueueEntry.Status.SKIPPED
        entry.save(update_fields=["status", "updated_at"])
        return entry


def requeue_entry(entry_id) -> QueueEntry:
    with transaction.atomic():
        entry, appointment = _lock_entry(entry_id)
        if entry.status != QueueEntry.Status.SKIPPED or appointment.status != Appointment.Status.IN_QUEUE:
            _reject()
        current = QueueEntry.objects.select_for_update().filter(
            branch_id=entry.branch_id,
            doctor_id=entry.doctor_id,
            service_date=entry.service_date,
        ).aggregate(highest=Max("position"))
        entry.status = QueueEntry.Status.WAITING
        entry.position = (current["highest"] or 0) + 1
        entry.called_at = None
        entry.started_at = None
        entry.save(update_fields=["status", "position", "called_at", "started_at", "updated_at"])
        return entry
