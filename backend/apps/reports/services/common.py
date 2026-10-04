from datetime import date, timedelta
from decimal import Decimal

from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError

from apps.clinics.models import Clinic


def parse_iso_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise DRFValidationError({field: "Use YYYY-MM-DD."}) from exc


def parse_report_range(params, *, max_days: int = 366) -> tuple[date, date]:
    single = (params.get("date") or "").strip()
    start_raw = (params.get("from") or "").strip()
    end_raw = (params.get("to") or "").strip()

    if single:
        parsed = parse_iso_date(single, "date")
        return parsed, parsed

    if start_raw or end_raw:
        if not start_raw or not end_raw:
            raise DRFValidationError({"from": "Both from and to are required for a date range."})
        start = parse_iso_date(start_raw, "from")
        end = parse_iso_date(end_raw, "to")
        if end < start:
            raise DRFValidationError({"to": "End date must be on or after start date."})
        if (end - start).days > max_days:
            raise DRFValidationError({"to": f"Date range cannot exceed {max_days} days."})
        return start, end

    today = timezone.localdate()
    return today, today


def clinic_meta(clinic_id) -> dict:
    clinic = Clinic.objects.filter(id=clinic_id).only("currency", "locale").first()
    return {
        "currency": clinic.currency if clinic else "USD",
        "locale": clinic.locale if clinic else "en",
    }


def scope_branch(queryset, branch_id, lookup: str = "branch_id"):
    if branch_id is not None:
        return queryset.filter(**{lookup: branch_id})
    return queryset


def money_str(value) -> str:
    if value is None:
        return "0.00"
    if isinstance(value, Decimal):
        return str(value.quantize(Decimal("0.01")))
    return str(value)


def date_range_list(start: date, end: date) -> list[date]:
    days = (end - start).days
    return [start + timedelta(days=offset) for offset in range(days + 1)]
