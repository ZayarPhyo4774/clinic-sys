from decimal import Decimal

import pytest

from apps.encounters.vital_conversions import normalize_vital_field_to_storage


@pytest.mark.parametrize(
    ("field", "value", "display_unit", "expected"),
    [
        ("weight_kg", "180.5", "lb", Decimal("81.87")),
        ("weight_kg", "70.555", "kg", Decimal("70.56")),
        ("height_cm", "70", "in", Decimal("177.8")),
        ("temperature", "98.6", "°F", Decimal("37.0")),
        ("temperature", "37.25", "°C", Decimal("37.3")),
    ],
)
def test_normalize_vital_field_to_storage_quantizes(field, value, display_unit, expected):
    assert normalize_vital_field_to_storage(field, value, display_unit) == expected
