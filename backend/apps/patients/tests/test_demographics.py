from datetime import date

import pytest
from django.utils import timezone

from apps.patients.demographics import approximate_date_of_birth_from_age, patient_age_in_years


def test_approximate_date_of_birth_from_age_uses_mid_year():
    reference = date(2026, 10, 6)
    assert approximate_date_of_birth_from_age(45, reference=reference) == date(1981, 7, 1)


def test_patient_age_in_years_respects_birthday():
    reference = date(2026, 3, 1)
    assert patient_age_in_years(date(1990, 5, 1), reference=reference) == 35
    assert patient_age_in_years(date(1990, 1, 1), reference=reference) == 36


@pytest.mark.django_db
def test_patient_age_in_years_uses_local_date():
    today = timezone.localdate()
    assert patient_age_in_years(date(today.year - 10, 7, 1)) == 10
