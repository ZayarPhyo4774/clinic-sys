"""Patient age and date-of-birth helpers."""

from __future__ import annotations

from datetime import date

from django.utils import timezone


def approximate_date_of_birth_from_age(age: int, reference: date | None = None) -> date:
    reference = reference or timezone.localdate()
    birth_year = reference.year - age
    return date(birth_year, 7, 1)


def patient_age_in_years(date_of_birth: date, reference: date | None = None) -> int:
    reference = reference or timezone.localdate()
    years = reference.year - date_of_birth.year
    if (reference.month, reference.day) < (date_of_birth.month, date_of_birth.day):
        years -= 1
    return years
