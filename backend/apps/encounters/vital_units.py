"""Vital sign field metadata for forms, charts, and print views."""

from __future__ import annotations

from typing import Any

VITAL_UNIT_OPTIONS: dict[str, tuple[str, ...]] = {
    "temperature": ("°C", "°F"),
    "pulse": ("bpm",),
    "respiratory_rate": ("/min",),
    "spo2": ("%",),
    "systolic": ("mmHg",),
    "diastolic": ("mmHg",),
    "weight_kg": ("kg", "lb"),
    "height_cm": ("cm", "in"),
}

VITAL_UNIT_FIELDS: tuple[dict[str, Any], ...] = (
    {
        "field": "temperature",
        "label": "Temperature",
        "short_label": "Temp",
        "unit": "°C",
        "input_mode": "decimal",
    },
    {
        "field": "pulse",
        "label": "Pulse",
        "short_label": "Pulse",
        "unit": "bpm",
        "input_mode": "numeric",
    },
    {
        "field": "respiratory_rate",
        "label": "Respiratory rate",
        "short_label": "RR",
        "unit": "/min",
        "input_mode": "numeric",
    },
    {
        "field": "spo2",
        "label": "SpO₂",
        "short_label": "SpO₂",
        "unit": "%",
        "input_mode": "numeric",
    },
    {
        "field": "systolic",
        "label": "Systolic",
        "short_label": "Systolic",
        "unit": "mmHg",
        "input_mode": "numeric",
        "group": "blood_pressure",
    },
    {
        "field": "diastolic",
        "label": "Diastolic",
        "short_label": "Diastolic",
        "unit": "mmHg",
        "input_mode": "numeric",
        "group": "blood_pressure",
    },
    {
        "field": "weight_kg",
        "label": "Weight",
        "short_label": "Weight",
        "unit": "kg",
        "input_mode": "decimal",
    },
    {
        "field": "height_cm",
        "label": "Height",
        "short_label": "Height",
        "unit": "cm",
        "input_mode": "decimal",
    },
)


def _default_units_map() -> dict[str, str]:
    return {row["field"]: row["unit"] for row in VITAL_UNIT_FIELDS}


def resolve_vital_units(unit_overrides: dict[str, str] | None = None) -> list[dict[str, Any]]:
    overrides = unit_overrides or {}
    resolved: list[dict[str, Any]] = []
    for row in VITAL_UNIT_FIELDS:
        field = row["field"]
        unit = overrides.get(field, row["unit"])
        allowed = VITAL_UNIT_OPTIONS.get(field, (row["unit"],))
        if unit not in allowed:
            unit = row["unit"]
        resolved.append({**row, "unit": unit})
    return resolved


def vital_units_payload(clinic=None) -> dict[str, Any]:
    overrides: dict[str, str] = {}
    if clinic is not None:
        from apps.clinics.vital_settings_services import get_clinic_vital_unit_overrides

        overrides = get_clinic_vital_unit_overrides(clinic)
    return {
        "fields": resolve_vital_units(overrides),
        "options": {field: list(options) for field, options in VITAL_UNIT_OPTIONS.items()},
        "defaults": _default_units_map(),
    }
