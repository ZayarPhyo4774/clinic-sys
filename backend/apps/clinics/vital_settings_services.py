from apps.clinics.models import Clinic, ClinicVitalSettings
from apps.encounters.vital_units import VITAL_UNIT_OPTIONS, _default_units_map


def ensure_vital_settings(clinic: Clinic) -> ClinicVitalSettings:
    settings, _ = ClinicVitalSettings.objects.get_or_create(clinic=clinic)
    return settings


def get_clinic_vital_unit_overrides(clinic) -> dict[str, str]:
    if clinic is None:
        return {}
    settings = ensure_vital_settings(clinic)
    return {key: value for key, value in (settings.units or {}).items() if key in VITAL_UNIT_OPTIONS}


def vital_settings_payload(clinic: Clinic) -> dict:
    settings = ensure_vital_settings(clinic)
    return {
        "units": {**_default_units_map(), **get_clinic_vital_unit_overrides(clinic)},
        "configured_units": settings.units or {},
        "options": {field: list(options) for field, options in VITAL_UNIT_OPTIONS.items()},
        "defaults": _default_units_map(),
    }
