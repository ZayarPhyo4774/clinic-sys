"""Vital sign field metadata for forms, charts, and print views."""

from __future__ import annotations

from typing import Any

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


def vital_units_payload() -> dict[str, list[dict[str, Any]]]:
    return {"fields": list(VITAL_UNIT_FIELDS)}
