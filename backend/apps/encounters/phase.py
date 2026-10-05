from django.core.exceptions import ValidationError

from apps.encounters.models import Encounter


def ensure_triage_phase(encounter: Encounter) -> None:
    if encounter.phase != Encounter.Phase.TRIAGE:
        raise ValidationError({"encounter": "Vitals can only be recorded during triage."})


def ensure_consultation_phase(encounter: Encounter) -> None:
    if encounter.phase != Encounter.Phase.CONSULTATION:
        raise ValidationError({"encounter": "Start the consultation before recording clinical facts."})
