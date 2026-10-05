from apps.clinics.ccr_defaults import DEFAULT_DISABILITY_TYPE_LABELS
from apps.clinics.models import Clinic, ClinicCcrSettings, ClinicDisabilityType


def ensure_ccr_settings(clinic: Clinic) -> ClinicCcrSettings:
    settings, _ = ClinicCcrSettings.objects.get_or_create(clinic=clinic)
    return settings


def ensure_default_disability_types(clinic: Clinic) -> None:
    if ClinicDisabilityType.objects.filter(clinic=clinic).exists():
        return
    ClinicDisabilityType.objects.bulk_create(
        [
            ClinicDisabilityType(clinic=clinic, sort_order=index, label=label)
            for index, label in enumerate(DEFAULT_DISABILITY_TYPE_LABELS, start=1)
        ]
    )


def get_ccr_settings(clinic_id) -> ClinicCcrSettings:
    clinic = Clinic.objects.get(pk=clinic_id)
    settings = ensure_ccr_settings(clinic)
    ensure_default_disability_types(clinic)
    return settings
