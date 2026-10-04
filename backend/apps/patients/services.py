from django.db import IntegrityError, transaction

from apps.patients.models import PatientNumberSequence


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
        sequence.last_value += 1
        sequence.save(update_fields=["last_value", "updated_at"])
        return f"{sequence.last_value:06d}"
