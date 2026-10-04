from django.db.models import Count, Sum

from apps.appointments.models import Appointment
from apps.billing.models import Invoice, InvoiceItem, Payment
from apps.billing.services import balance_of
from apps.encounters.models import Encounter
from apps.patients.models import Patient
from apps.queues.models import QueueEntry
from apps.reports.services.common import clinic_meta, money_str, scope_branch


def build_summary_report(*, clinic_id, branch_id, start, end) -> dict:
    meta = clinic_meta(clinic_id)
    single_day = start == end

    appointments = Appointment.objects.filter(
        clinic_id=clinic_id,
        starts_at__date__gte=start,
        starts_at__date__lte=end,
    )
    queue_entries = QueueEntry.objects.filter(
        clinic_id=clinic_id,
        service_date__gte=start,
        service_date__lte=end,
    )
    patients = Patient.objects.filter(clinic_id=clinic_id, is_active=True)
    invoices_created = Invoice.objects.filter(
        clinic_id=clinic_id,
        created_at__date__gte=start,
        created_at__date__lte=end,
    )
    issued_invoices = Invoice.objects.filter(
        clinic_id=clinic_id,
        issued_at__date__gte=start,
        issued_at__date__lte=end,
    )
    payments = Payment.objects.filter(
        clinic_id=clinic_id,
        paid_at__date__gte=start,
        paid_at__date__lte=end,
    )
    open_invoices = Invoice.objects.filter(clinic_id=clinic_id, status__in=Invoice.OPEN_FOR_PAYMENT)
    encounters = Encounter.objects.filter(
        clinic_id=clinic_id,
        started_at__date__gte=start,
        started_at__date__lte=end,
    )

    appointments = scope_branch(appointments, branch_id)
    queue_entries = scope_branch(queue_entries, branch_id)
    patients = scope_branch(patients, branch_id)
    invoices_created = scope_branch(invoices_created, branch_id)
    issued_invoices = scope_branch(issued_invoices, branch_id)
    payments = scope_branch(payments, branch_id)
    open_invoices = scope_branch(open_invoices, branch_id)
    encounters = scope_branch(encounters, branch_id)

    appointments_by_status = {
        row["status"]: row["count"] for row in appointments.values("status").annotate(count=Count("id"))
    }
    queue_by_status = {
        row["status"]: row["count"] for row in queue_entries.values("status").annotate(count=Count("id"))
    }
    invoice_totals = invoices_created.aggregate(count=Count("id"), total=Sum("total"))
    issued_totals = issued_invoices.aggregate(count=Count("id"), total=Sum("total"))
    payments_collected = payments.aggregate(total=Sum("amount"))["total"] or 0
    payments_by_method = {
        row["method__name"]: money_str(row["total"])
        for row in payments.values("method__name").annotate(total=Sum("amount"))
    }
    outstanding_balance = sum(balance_of(invoice) for invoice in open_invoices.prefetch_related("payments"))

    walk_in_count = appointments.filter(visit_reason__icontains="walk-in").count()
    no_show_count = appointments.filter(status=Appointment.Status.NO_SHOW).count()
    cancellation_count = appointments.filter(status=Appointment.Status.CANCELLED).count()
    encounters_completed = encounters.filter(status=Encounter.Status.COMPLETED).count()

    encounter_patients = set(encounters.values_list("patient_id", flat=True))
    completed_appointment_patients = set(
        appointments.filter(status=Appointment.Status.COMPLETED).values_list("patient_id", flat=True)
    )
    patients_seen = len(encounter_patients | completed_appointment_patients)

    item_qs = InvoiceItem.objects.filter(
        invoice__clinic_id=clinic_id,
        invoice__issued_at__isnull=False,
        invoice__issued_at__date__gte=start,
        invoice__issued_at__date__lte=end,
    )
    if branch_id is not None:
        item_qs = item_qs.filter(invoice__branch_id=branch_id)
    revenue_totals: dict[str, object] = {}
    for item in item_qs.only("kind", "quantity", "unit_price", "discount_amount").iterator():
        revenue_totals[item.kind] = revenue_totals.get(item.kind, 0) + item.line_total
    revenue_by_kind = {kind: money_str(total) for kind, total in revenue_totals.items()}

    manual_invoice_count = issued_invoices.filter(encounter__isnull=True).count()

    payload = {
        "from": start.isoformat(),
        "to": end.isoformat(),
        "date": start.isoformat() if single_day else None,
        **meta,
        "appointments_by_status": appointments_by_status,
        "queue_by_status": queue_by_status,
        "appointment_count": sum(appointments_by_status.values()),
        "queue_count": sum(queue_by_status.values()),
        "active_patients": patients.count(),
        "patients_seen": patients_seen,
        "walk_in_count": walk_in_count,
        "no_show_count": no_show_count,
        "cancellation_count": cancellation_count,
        "encounters_completed": encounters_completed,
        "invoice_count": invoice_totals["count"] or 0,
        "invoice_total": money_str(invoice_totals["total"]),
        "issued_invoice_count": issued_totals["count"] or 0,
        "issued_invoice_total": money_str(issued_totals["total"]),
        "manual_invoice_count": manual_invoice_count,
        "payments_collected": money_str(payments_collected),
        "payments_by_method": payments_by_method,
        "revenue_by_kind": revenue_by_kind,
        "outstanding_balance": money_str(outstanding_balance),
        "open_invoice_count": open_invoices.count(),
    }
    return payload
