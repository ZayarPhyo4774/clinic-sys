from django.db import IntegrityError, transaction
from django.db.models import IntegerField, Max
from django.db.models.functions import Cast

from apps.patients.models import Patient, PatientNumberSequence


def next_patient_number(clinic) -> str:
    """Allocate the next patient number for one clinic. Unique inside that clinic."""
    with transaction.atomic():
        try:
            sequence, _ = PatientNumberSequence.objects.select_for_update().get_or_create(
                clinic=clinic,
                defaults={"last_value": 0},
            )
        except IntegrityError:
            sequence = PatientNumberSequence.objects.select_for_update().get(clinic=clinic)
        assigned = (
            Patient.objects.filter(clinic=clinic, patient_number__regex=r"^[0-9]+$")
            .aggregate(highest=Max(Cast("patient_number", IntegerField())))
            .get("highest")
            or 0
        )
        if sequence.last_value < assigned:
            sequence.last_value = assigned
        sequence.last_value += 1
        sequence.save(update_fields=["last_value", "updated_at"])
        return f"{sequence.last_value:06d}"
