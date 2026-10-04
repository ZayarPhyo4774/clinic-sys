from django.db.models import Count, Sum
from django.utils import timezone

from apps.billing.models import Invoice, InvoiceItem, Payment, Refund
from apps.billing.services import balance_of
from apps.reports.services.common import clinic_meta, money_str, scope_branch


def _ar_aging(open_invoices, today):
    buckets = {"0_7": 0, "8_30": 0, "31_plus": 0}
    bucket_amounts = {"0_7": 0, "8_30": 0, "31_plus": 0}
    for invoice in open_invoices:
        if not invoice.issued_at:
            continue
        age = (today - invoice.issued_at.date()).days
        balance = balance_of(invoice)
        if age <= 7:
            key = "0_7"
        elif age <= 30:
            key = "8_30"
        else:
            key = "31_plus"
        buckets[key] += 1
        bucket_amounts[key] += balance
    return {
        "counts": buckets,
        "amounts": {key: money_str(val) for key, val in bucket_amounts.items()},
    }


def build_financial_report(*, clinic_id, branch_id, start, end) -> dict:
    meta = clinic_meta(clinic_id)
    today = timezone.localdate()

    payments = Payment.objects.filter(clinic_id=clinic_id, paid_at__date__gte=start, paid_at__date__lte=end)
    refunds = Refund.objects.filter(clinic_id=clinic_id, refunded_at__date__gte=start, refunded_at__date__lte=end)
    issued = Invoice.objects.filter(
        clinic_id=clinic_id,
        issued_at__isnull=False,
        issued_at__date__gte=start,
        issued_at__date__lte=end,
    )
    open_invoices = Invoice.objects.filter(clinic_id=clinic_id, status__in=Invoice.OPEN_FOR_PAYMENT)

    payments = scope_branch(payments, branch_id)
    refunds = scope_branch(refunds, branch_id)
    issued = scope_branch(issued, branch_id)
    open_invoices = scope_branch(open_invoices, branch_id)

    collected = payments.aggregate(total=Sum("amount"))["total"] or 0
    refunded = refunds.aggregate(total=Sum("amount"))["total"] or 0
    payments_by_method = {
        row["method__name"]: money_str(row["total"])
        for row in payments.values("method__name").annotate(total=Sum("amount"))
    }
    refunds_by_reason = {
        row["reason"]: money_str(row["total"])
        for row in refunds.values("reason").annotate(total=Sum("amount"))
    }

    revenue_by_kind: dict[str, object] = {}
    items = InvoiceItem.objects.filter(
        invoice__clinic_id=clinic_id,
        invoice__issued_at__isnull=False,
        invoice__issued_at__date__gte=start,
        invoice__issued_at__date__lte=end,
    )
    if branch_id is not None:
        items = items.filter(invoice__branch_id=branch_id)
    for item in items.only("kind", "quantity", "unit_price", "discount_amount").iterator():
        revenue_by_kind[item.kind] = revenue_by_kind.get(item.kind, 0) + item.line_total
    revenue_by_kind = {kind: money_str(total) for kind, total in revenue_by_kind.items()}

    doctor_rows = []
    for row in (
        issued.values("doctor_id", "doctor__staff__user__full_name")
        .annotate(count=Count("id"), total=Sum("total"))
        .order_by("-total")[:20]
    ):
        doctor_rows.append(
            {
                "doctor_id": str(row["doctor_id"]),
                "doctor_name": row["doctor__staff__user__full_name"] or "Unknown",
                "invoice_count": row["count"],
                "total": money_str(row["total"]),
            }
        )

    manual = issued.filter(encounter__isnull=True).aggregate(count=Count("id"), total=Sum("total"))
    encounter_linked = issued.filter(encounter__isnull=False).aggregate(count=Count("id"), total=Sum("total"))

    outstanding = sum(balance_of(inv) for inv in open_invoices.prefetch_related("payments"))

    return {
        "from": start.isoformat(),
        "to": end.isoformat(),
        **meta,
        "payments_collected": money_str(collected),
        "refunds_total": money_str(refunded),
        "net_collected": money_str(collected - refunded),
        "payments_by_method": payments_by_method,
        "refunds_by_reason": refunds_by_reason,
        "issued_invoice_count": issued.count(),
        "issued_invoice_total": money_str(issued.aggregate(t=Sum("total"))["t"]),
        "revenue_by_kind": revenue_by_kind,
        "doctor_revenue": doctor_rows,
        "manual_invoices": {
            "count": manual["count"] or 0,
            "total": money_str(manual["total"]),
        },
        "encounter_invoices": {
            "count": encounter_linked["count"] or 0,
            "total": money_str(encounter_linked["total"]),
        },
        "outstanding_balance": money_str(outstanding),
        "open_invoice_count": open_invoices.count(),
        "ar_aging": _ar_aging(open_invoices.prefetch_related("payments"), today),
    }
