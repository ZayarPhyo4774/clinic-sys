import pytest
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.reports.services.common import parse_report_range
from apps.reports.services.summary import build_summary_report


@pytest.mark.django_db
def test_parse_report_range_defaults_to_today():
    start, end = parse_report_range({})
    today = timezone.localdate()
    assert start == today
    assert end == today


def test_parse_report_range_rejects_invalid_range():
    with pytest.raises(ValidationError):
        parse_report_range({"from": "2026-01-10", "to": "2026-01-01"})


@pytest.mark.django_db
def test_build_summary_report_shape(clinic, branch):
    today = timezone.localdate()
    payload = build_summary_report(clinic_id=clinic.id, branch_id=branch.id, start=today, end=today)
    assert payload["from"] == today.isoformat()
    assert "patients_seen" in payload
    assert "revenue_by_kind" in payload
    assert payload["currency"] == "USD"
