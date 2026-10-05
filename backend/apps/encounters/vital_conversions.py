"""Convert vital measurements between display units and canonical storage units."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

STORAGE_UNITS = {
    "temperature": "°C",
    "weight_kg": "kg",
    "height_cm": "cm",
}

STORAGE_QUANTIZE = {
    "temperature": Decimal("0.1"),
    "weight_kg": Decimal("0.01"),
    "height_cm": Decimal("0.1"),
}


def _quantize_storage(field: str, value: Decimal) -> Decimal:
    step = STORAGE_QUANTIZE.get(field)
    if step is None:
        return value
    return value.quantize(step, rounding=ROUND_HALF_UP)


def _decimal(value) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value))


def convert_temperature_to_storage(value, from_unit: str):
    parsed = _decimal(value)
    if parsed is None:
        return value
    if from_unit == "°F":
        converted = (parsed - Decimal("32")) * Decimal("5") / Decimal("9")
        return _quantize_storage("temperature", converted)
    return _quantize_storage("temperature", parsed)


def convert_temperature_from_storage(value, to_unit: str):
    parsed = _decimal(value)
    if parsed is None:
        return value
    if to_unit == "°F":
        return parsed * Decimal("9") / Decimal("5") + Decimal("32")
    return parsed


def convert_weight_to_storage(value, from_unit: str):
    parsed = _decimal(value)
    if parsed is None:
        return value
    if from_unit == "lb":
        converted = parsed * Decimal("0.453592")
        return _quantize_storage("weight_kg", converted)
    return _quantize_storage("weight_kg", parsed)


def convert_weight_from_storage(value, to_unit: str):
    parsed = _decimal(value)
    if parsed is None:
        return value
    if to_unit == "lb":
        return parsed / Decimal("0.453592")
    return parsed


def convert_height_to_storage(value, from_unit: str):
    parsed = _decimal(value)
    if parsed is None:
        return value
    if from_unit == "in":
        converted = parsed * Decimal("2.54")
        return _quantize_storage("height_cm", converted)
    return _quantize_storage("height_cm", parsed)


def convert_height_from_storage(value, to_unit: str):
    parsed = _decimal(value)
    if parsed is None:
        return value
    if to_unit == "in":
        return parsed / Decimal("2.54")
    return parsed


def normalize_vital_field_to_storage(field: str, value, display_unit: str):
    if value is None or value == "":
        return value
    storage_unit = STORAGE_UNITS.get(field)
    if storage_unit and display_unit == storage_unit:
        parsed = _decimal(value)
        if parsed is None:
            return value
        return _quantize_storage(field, parsed)
    if field == "temperature":
        return convert_temperature_to_storage(value, display_unit)
    if field == "weight_kg":
        return convert_weight_to_storage(value, display_unit)
    if field == "height_cm":
        return convert_height_to_storage(value, display_unit)
    return value


def format_vital_field_from_storage(field: str, value, display_unit: str):
    if value is None or value == "":
        return value
    storage_unit = STORAGE_UNITS.get(field)
    if storage_unit and display_unit == storage_unit:
        return value
    if field == "temperature":
        return convert_temperature_from_storage(value, display_unit)
    if field == "weight_kg":
        return convert_weight_from_storage(value, display_unit)
    if field == "height_cm":
        return convert_height_from_storage(value, display_unit)
    return value
