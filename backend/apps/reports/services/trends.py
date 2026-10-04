from datetime import timedelta
from decimal import Decimal

from django.db.models import Count, Sum
from django.db.models.functions import TruncDate

from apps.appointments.models import Appointment
from apps.billing.models import Invoice, Payment
from apps.encounters.models import Encounter
from apps.reports.services.common import clinic_meta, date_range_list, money_str, scope_branch


def _period_totals(*, clinic_id, branch_id, start, end) -> dict:
    payments = Payment.objects.filter(clinic_id=clinic_id, paid_at__date__gte=start, paid_at__date__lte=end)
    issued = Invoice.objects.filter(
        clinic_id=clinic_id,
        issued_at__isnull=False,
        issued_at__date__gte=start,
        issued_at__date__lte=end,
    )
    appointments = Appointment.objects.filter(
        clinic_id=clinic_id,
        starts_at__date__gte=start,
        starts_at__date__lte=end,
    )
    encounters = Encounter.objects.filter(
        clinic_id=clinic_id,
        started_at__date__gte=start,
        started_at__date__lte=end,
    )

    payments = scope_branch(payments, branch_id)
    issued = scope_branch(issued, branch_id)
    appointments = scope_branch(appointments, branch_id)
    encounters = scope_branch(encounters, branch_id)

    return {
        "payments_collected": payments.aggregate(total=Sum("amount"))["total"] or Decimal("0"),
        "issued_total": issued.aggregate(total=Sum("total"))["total"] or Decimal("0"),
        "appointments": appointments.count(),
        "encounters": encounters.count(),
    }


def _pct_change(current, previous) -> float | None:
    if previous in (0, Decimal("0"), None):
        return None
    return round(float((current - previous) / previous * 100), 1)


def build_trends_report(*, clinic_id, branch_id, start, end) -> dict:
    meta = clinic_meta(clinic_id)
    days = date_range_list(start, end)

    payments = Payment.objects.filter(clinic_id=clinic_id, paid_at__date__gte=start, paid_at__date__lte=end)
    issued = Invoice.objects.filter(
        clinic_id=clinic_id,
        issued_at__isnull=False,
        issued_at__date__gte=start,
        issued_at__date__lte=end,
    )
    appointments = Appointment.objects.filter(
        clinic_id=clinic_id,
        starts_at__date__gte=start,
        starts_at__date__lte=end,
    )
    encounters = Encounter.objects.filter(
        clinic_id=clinic_id,
        started_at__date__gte=start,
        started_at__date__lte=end,
    )

    payments = scope_branch(payments, branch_id)
    issued = scope_branch(issued, branch_id)
    appointments = scope_branch(appointments, branch_id)
    encounters = scope_branch(encounters, branch_id)

    payments_by_day = {
        row["day"].isoformat(): money_str(row["total"])
        for row in payments.annotate(day=TruncDate("paid_at")).values("day").annotate(total=Sum("amount"))
    }
    issued_by_day = {
        row["day"].isoformat(): money_str(row["total"])
        for row in issued.annotate(day=TruncDate("issued_at")).values("day").annotate(total=Sum("total"))
    }
    appointments_by_day = {
        row["day"].isoformat(): row["count"]
        for row in appointments.annotate(day=TruncDate("starts_at")).values("day").annotate(count=Count("id"))
    }
    encounters_by_day = {
        row["day"].isoformat(): row["count"]
        for row in encounters.annotate(day=TruncDate("started_at")).values("day").annotate(count=Count("id"))
    }

    series = []
    for day in days:
        key = day.isoformat()
        series.append(
            {
                "date": key,
                "payments_collected": payments_by_day.get(key, "0.00"),
                "issued_total": issued_by_day.get(key, "0.00"),
                "appointments": appointments_by_day.get(key, 0),
                "encounters": encounters_by_day.get(key, 0),
            }
        )

    period_days = (end - start).days + 1
    prior_end = start - timedelta(days=1)
    prior_start = prior_end - timedelta(days=period_days - 1)
    current_totals = _period_totals(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end)
    prior_totals = _period_totals(clinic_id=clinic_id, branch_id=branch_id, start=prior_start, end=prior_end)

    comparison = {
        "prior_from": prior_start.isoformat(),
        "prior_to": prior_end.isoformat(),
        "payments_collected": {
            "current": money_str(current_totals["payments_collected"]),
            "prior": money_str(prior_totals["payments_collected"]),
            "change_percent": _pct_change(current_totals["payments_collected"], prior_totals["payments_collected"]),
        },
        "issued_total": {
            "current": money_str(current_totals["issued_total"]),
            "prior": money_str(prior_totals["issued_total"]),
            "change_percent": _pct_change(current_totals["issued_total"], prior_totals["issued_total"]),
        },
        "appointments": {
            "current": current_totals["appointments"],
            "prior": prior_totals["appointments"],
            "change_percent": _pct_change(current_totals["appointments"], prior_totals["appointments"]),
        },
        "encounters": {
            "current": current_totals["encounters"],
            "prior": prior_totals["encounters"],
            "change_percent": _pct_change(current_totals["encounters"], prior_totals["encounters"]),
        },
    }

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        **meta,
        "series": series,
        "comparison": comparison,
    }
