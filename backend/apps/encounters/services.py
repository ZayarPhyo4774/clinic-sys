from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from apps.appointments.models import Appointment
from apps.appointments.services import lock_visit
from apps.encounters.models import Encounter


def start_encounter(appointment_id, user) -> Encounter:
    with transaction.atomic():
        appointment = lock_visit(appointment_id)
        if appointment.status != Appointment.Status.IN_CONSULTATION:
            raise ValidationError({"appointment": "Start the consultation before the encounter."})
        if Encounter.objects.filter(appointment_id=appointment.pk).exists():
            raise ValidationError({"appointment": "An encounter already exists for this appointment."})
        encounter = Encounter(
            appointment=appointment,
            started_by=user,
            status=Encounter.Status.OPEN,
            started_at=timezone.now(),
        )
        encounter.save()
        return encounter


def complete_encounter(encounter_id, user) -> Encounter:
    with transaction.atomic():
        appointment_id = Encounter.objects.values_list("appointment_id", flat=True).get(pk=encounter_id)
        lock_visit(appointment_id)
        encounter = Encounter.objects.select_for_update().get(pk=encounter_id)
        if encounter.status != Encounter.Status.OPEN:
            raise ValidationError({"status": "This status change is not allowed."})
        encounter.status = Encounter.Status.COMPLETED
        encounter.completed_at = timezone.now()
        encounter.completed_by = user
        encounter.save(update_fields=["status", "completed_at", "completed_by", "updated_at"])
        return encounter
