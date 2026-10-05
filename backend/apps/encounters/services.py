from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.appointments.services import lock_visit
from apps.encounters.models import Encounter
from apps.queues.models import QueueEntry


def start_triage_encounter(appointment_id, user) -> Encounter:
    with transaction.atomic():
        appointment = lock_visit(appointment_id)
        if appointment.status != Appointment.Status.IN_QUEUE:
            raise ValidationError({"appointment": "The patient must be in the queue before triage."})
        existing = Encounter.objects.select_for_update().filter(appointment_id=appointment.pk).first()
        if existing is not None:
            if existing.phase == Encounter.Phase.TRIAGE:
                return existing
            raise ValidationError({"appointment": "An encounter already exists for this appointment."})
        encounter = Encounter(
            appointment=appointment,
            started_by=user,
            status=Encounter.Status.OPEN,
            phase=Encounter.Phase.TRIAGE,
            started_at=timezone.now(),
        )
        encounter.save()
        return encounter


def begin_consultation_phase(appointment_id, user) -> Encounter:
    with transaction.atomic():
        appointment = lock_visit(appointment_id)
        if appointment.status != Appointment.Status.IN_CONSULTATION:
            raise ValidationError({"appointment": "Start the consultation before opening the chart."})
        encounter = Encounter.objects.select_for_update().filter(appointment_id=appointment.pk).first()
        if encounter is None:
            encounter = Encounter(
                appointment=appointment,
                started_by=user,
                status=Encounter.Status.OPEN,
                phase=Encounter.Phase.CONSULTATION,
                started_at=timezone.now(),
            )
            encounter.save()
            return encounter
        if encounter.phase == Encounter.Phase.CONSULTATION:
            return encounter
        if encounter.phase != Encounter.Phase.TRIAGE:
            raise ValidationError({"phase": "Encounter phase cannot change."})
        encounter.phase = Encounter.Phase.CONSULTATION
        encounter.save(update_fields=["phase", "updated_at"])
        return encounter


def start_encounter(appointment_id, user) -> Encounter:
    with transaction.atomic():
        appointment = lock_visit(appointment_id)
        if appointment.status != Appointment.Status.IN_CONSULTATION:
            raise ValidationError({"appointment": "Start the consultation before the encounter."})
        existing = Encounter.objects.select_for_update().filter(appointment_id=appointment.pk).first()
        if existing is not None:
            if existing.status == Encounter.Status.OPEN:
                return existing
            raise ValidationError({"appointment": "An encounter already exists for this appointment."})
        encounter = Encounter(
            appointment=appointment,
            started_by=user,
            status=Encounter.Status.OPEN,
            phase=Encounter.Phase.CONSULTATION,
            started_at=timezone.now(),
        )
        try:
            encounter.save()
        except IntegrityError:
            existing = Encounter.objects.get(appointment_id=appointment.pk)
            if existing.status == Encounter.Status.OPEN:
                return existing
            raise
        return encounter


def complete_encounter(encounter_id, user) -> Encounter:
    from apps.encounters.consultation_meta_services import get_or_create_consultation_meta, validate_consultation_for_complete

    with transaction.atomic():
        appointment_id = Encounter.objects.values_list("appointment_id", flat=True).get(pk=encounter_id)
        lock_visit(appointment_id)
        encounter = Encounter.objects.select_for_update().get(pk=encounter_id)
        if encounter.status != Encounter.Status.OPEN:
            raise ValidationError({"status": "This status change is not allowed."})
        if encounter.phase != Encounter.Phase.CONSULTATION:
            raise ValidationError({"phase": "Complete the consultation before closing the chart."})
        meta = get_or_create_consultation_meta(encounter, user=user)
        validate_consultation_for_complete(encounter, meta)
        encounter.status = Encounter.Status.COMPLETED
        encounter.completed_at = timezone.now()
        encounter.completed_by = user
        encounter.save(update_fields=["status", "completed_at", "completed_by", "updated_at"])
        return encounter


def mark_vitals_recorded(appointment_id) -> None:
    QueueEntry.objects.filter(
        appointment_id=appointment_id,
        vitals_recorded_at__isnull=True,
    ).update(vitals_recorded_at=timezone.now())
