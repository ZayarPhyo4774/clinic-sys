"""Tabular CSV downloads for clinic operations reports.

Each file is a workbook-style sheet: a title, the clinic and period, then
named tables a receptionist, accountant, or pharmacist can open in Excel.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime
from zoneinfo import ZoneInfo

from django.utils import timezone

from apps.appointments.models import Appointment
from apps.billing.models import Invoice, Payment, Refund
from apps.billing.services import balance_of
from apps.encounters.models import Encounter
from apps.laboratory.models import LabOrder, LabResult
from apps.queues.models import QueueEntry
from apps.reports.services.common import clinic_localdate, scope_branch

STATUS_LABELS = {
    "out_of_stock": "Out of stock",
    "low_stock": "Low stock",
    "in_stock": "In stock",
}

TITLES = {
    "summary": "Clinic activity summary",
    "financial": "Financial report",
    "operations": "Operations report",
    "clinical": "Clinical report",
    "pharmacy": "Pharmacy inventory report",
    "laboratory": "Laboratory report",
    "trends": "Activity trends",
}


def render_report_csv(report: str, payload: dict, *, trends: dict | None, clinic_id, branch_id, start, end) -> str:
    book = CsvBook()
    book.title(TITLES.get(report, "Clinic report"))
    book.meta(payload)
    if report == "summary":
        _summary(book, payload, trends)
    elif report == "financial":
        _financial(book, payload, clinic_id, branch_id, start, end)
    elif report == "operations":
        _operations(book, payload, clinic_id, branch_id, start, end)
    elif report == "clinical":
        _clinical(book, payload, clinic_id, branch_id, start, end)
    elif report == "pharmacy":
        _pharmacy(book, payload)
    elif report == "laboratory":
        _laboratory(book, payload, clinic_id, branch_id, start, end)
    elif report == "trends":
        _trend_summary(book, payload)
        _trends(book, payload)
    return book.getvalue()


class CsvBook:
    def __init__(self):
        self.buffer = io.StringIO()
        self.buffer.write("\ufeff")
        self.writer = csv.writer(self.buffer)

    def getvalue(self) -> str:
        return self.buffer.getvalue()

    def title(self, text: str) -> None:
        self.writer.writerow([text])

    def blank(self) -> None:
        self.writer.writerow([])

    def meta(self, payload: dict) -> None:
        self.writer.writerow(["Clinic", payload.get("clinic_name") or ""])
        self.writer.writerow(["Period from", payload.get("from") or ""])
        self.writer.writerow(["Period to", payload.get("to") or ""])
        self.writer.writerow(["Currency", payload.get("currency") or ""])

    def section(self, name: str, headers: list[str], rows: list[list[object]]) -> None:
        self.blank()
        self.writer.writerow([name])
        self.writer.writerow(headers)
        if not rows:
            self.writer.writerow(["None"])
            return
        for row in rows:
            self.writer.writerow(row)

    def metrics(self, rows: list[list[object]]) -> None:
        self.section("Summary", ["Metric", "Value"], rows)


def _label(value) -> str:
    if value is None or value == "":
        return ""
    text = str(value).replace("_", " ").strip()
    if not text:
        return ""
    known = STATUS_LABELS.get(str(value))
    if known:
        return known
    return text[:1].upper() + text[1:]


def _count_rows(mapping: dict) -> list[list[object]]:
    return [[_label(key), value] for key, value in mapping.items()]


def _stamp(value, zone_name: str) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return value
        value = parsed
    zone = ZoneInfo(zone_name or "UTC")
    if timezone.is_naive(value):
        value = timezone.make_aware(value, timezone.utc)
    return value.astimezone(zone).strftime("%Y-%m-%d %H:%M")


def _doctor_name(doctor) -> str:
    staff = getattr(doctor, "staff", None)
    user = getattr(staff, "user", None) if staff is not None else None
    return getattr(user, "full_name", "") or ""


def _summary(book: CsvBook, payload: dict, trends: dict | None) -> None:
    book.metrics(
        [
            ["Appointments", payload.get("appointment_count", 0)],
            ["Patients seen", payload.get("patients_seen", 0)],
            ["Walk-ins", payload.get("walk_in_count", 0)],
            ["No-shows", payload.get("no_show_count", 0)],
            ["Cancellations", payload.get("cancellation_count", 0)],
            ["Encounters completed", payload.get("encounters_completed", 0)],
            ["Active patients", payload.get("active_patients", 0)],
            ["Queue entries", payload.get("queue_count", 0)],
            ["Invoices created", payload.get("invoice_count", 0)],
            ["Invoice total", payload.get("invoice_total", "0.00")],
            ["Issued invoices", payload.get("issued_invoice_count", 0)],
            ["Issued total", payload.get("issued_invoice_total", "0.00")],
            ["Manual invoices", payload.get("manual_invoice_count", 0)],
            ["Payments collected", payload.get("payments_collected", "0.00")],
            ["Outstanding balance", payload.get("outstanding_balance", "0.00")],
            ["Open invoices", payload.get("open_invoice_count", 0)],
        ]
    )
    book.section("Appointments by status", ["Status", "Count"], _count_rows(payload.get("appointments_by_status") or {}))
    book.section("Queue by status", ["Status", "Count"], _count_rows(payload.get("queue_by_status") or {}))
    book.section(
        "Revenue by service",
        ["Service", "Amount"],
        [[_label(kind), amount] for kind, amount in (payload.get("revenue_by_kind") or {}).items()],
    )
    book.section(
        "Payments by method",
        ["Method", "Amount"],
        [[method, amount] for method, amount in (payload.get("payments_by_method") or {}).items()],
    )
    if trends:
        _trends(book, trends)


def _financial(book: CsvBook, payload: dict, clinic_id, branch_id, start, end) -> None:
    zone = payload.get("timezone") or "UTC"
    manual = payload.get("manual_invoices") or {}
    encounter = payload.get("encounter_invoices") or {}
    aging = payload.get("ar_aging") or {}
    counts = aging.get("counts") or {}
    amounts = aging.get("amounts") or {}
    book.metrics(
        [
            ["Payments collected", payload.get("payments_collected", "0.00")],
            ["Refunds", payload.get("refunds_total", "0.00")],
            ["Net collected", payload.get("net_collected", "0.00")],
            ["Issued invoices", payload.get("issued_invoice_count", 0)],
            ["Issued total", payload.get("issued_invoice_total", "0.00")],
            ["Consultation invoices", encounter.get("count", 0)],
            ["Consultation invoice total", encounter.get("total", "0.00")],
            ["Manual invoices", manual.get("count", 0)],
            ["Manual invoice total", manual.get("total", "0.00")],
            ["Outstanding balance", payload.get("outstanding_balance", "0.00")],
            ["Open invoices", payload.get("open_invoice_count", 0)],
        ]
    )
    book.section(
        "Payments by method",
        ["Method", "Amount"],
        [[method, amount] for method, amount in (payload.get("payments_by_method") or {}).items()],
    )
    book.section(
        "Refunds by reason",
        ["Reason", "Amount"],
        [[_label(reason), amount] for reason, amount in (payload.get("refunds_by_reason") or {}).items()],
    )
    book.section(
        "Revenue by service",
        ["Service", "Amount"],
        [[_label(kind), amount] for kind, amount in (payload.get("revenue_by_kind") or {}).items()],
    )
    book.section(
        "Revenue by doctor",
        ["Doctor", "Invoices", "Amount"],
        [
            [row.get("doctor_name") or "", row.get("invoice_count") or 0, row.get("total") or "0.00"]
            for row in payload.get("doctor_revenue") or []
        ],
    )
    book.section(
        "Accounts receivable aging",
        ["Bucket", "Invoices", "Balance"],
        [
            ["0–7 days", counts.get("0_7", 0), amounts.get("0_7", "0.00")],
            ["8–30 days", counts.get("8_30", 0), amounts.get("8_30", "0.00")],
            ["31+ days", counts.get("31_plus", 0), amounts.get("31_plus", "0.00")],
        ],
    )

    issued = Invoice.objects.filter(
        clinic_id=clinic_id,
        issued_at__isnull=False,
        issued_at__date__gte=start,
        issued_at__date__lte=end,
    )
    issued = scope_branch(issued, branch_id).select_related("patient", "doctor__staff__user").order_by("issued_at")
    book.section(
        "Issued invoices",
        ["Invoice", "Issued", "Patient number", "Patient", "Doctor", "Status", "Total"],
        [
            [
                invoice.invoice_number,
                _stamp(invoice.issued_at, zone),
                invoice.patient.patient_number,
                invoice.patient.full_name,
                _doctor_name(invoice.doctor),
                _label(invoice.status),
                invoice.total,
            ]
            for invoice in issued
        ],
    )

    payments = Payment.objects.filter(clinic_id=clinic_id, paid_at__date__gte=start, paid_at__date__lte=end)
    payments = scope_branch(payments, branch_id).select_related("invoice", "patient", "method").order_by("paid_at")
    book.section(
        "Payments received",
        ["Paid at", "Invoice", "Patient number", "Patient", "Method", "Amount"],
        [
            [
                _stamp(payment.paid_at, zone),
                payment.invoice.invoice_number,
                payment.patient.patient_number,
                payment.patient.full_name,
                payment.method.name,
                payment.amount,
            ]
            for payment in payments
        ],
    )

    refunds = Refund.objects.filter(clinic_id=clinic_id, refunded_at__date__gte=start, refunded_at__date__lte=end)
    refunds = scope_branch(refunds, branch_id).select_related("payment__invoice", "patient").order_by("refunded_at")
    book.section(
        "Refunds",
        ["Refunded at", "Invoice", "Patient number", "Patient", "Reason", "Amount"],
        [
            [
                _stamp(refund.refunded_at, zone),
                refund.payment.invoice.invoice_number,
                refund.patient.patient_number,
                refund.patient.full_name,
                _label(refund.reason),
                refund.amount,
            ]
            for refund in refunds
        ],
    )

    today = clinic_localdate(clinic_id)
    open_invoices = Invoice.objects.filter(clinic_id=clinic_id, status__in=Invoice.OPEN_FOR_PAYMENT)
    open_invoices = scope_branch(open_invoices, branch_id).select_related("patient").prefetch_related("payments")
    open_rows = []
    for invoice in open_invoices.order_by("issued_at"):
        if not invoice.issued_at:
            continue
        age = (today - invoice.issued_at.date()).days
        open_rows.append(
            [
                invoice.invoice_number,
                invoice.patient.patient_number,
                invoice.patient.full_name,
                _stamp(invoice.issued_at, zone),
                age,
                balance_of(invoice),
            ]
        )
    book.section(
        "Open invoices",
        ["Invoice", "Patient number", "Patient", "Issued", "Age days", "Balance"],
        open_rows,
    )


def _operations(book: CsvBook, payload: dict, clinic_id, branch_id, start, end) -> None:
    zone = payload.get("timezone") or "UTC"
    book.metrics(
        [
            ["Appointments", payload.get("appointment_count", 0)],
            ["Scheduled", payload.get("scheduled_count", 0)],
            ["Walk-ins", payload.get("walk_in_count", 0)],
            ["Completed appointments", payload.get("completed_appointments", 0)],
            ["No-shows", payload.get("no_show_count", 0)],
            ["No-show rate %", payload.get("no_show_rate", 0)],
            ["Cancellations", payload.get("cancellation_count", 0)],
            ["Queue entries", payload.get("queue_count", 0)],
            ["Queue skipped", payload.get("queue_skipped", 0)],
            ["Queue cancelled", payload.get("queue_cancelled", 0)],
            ["Average wait minutes", payload.get("avg_wait_minutes") if payload.get("avg_wait_minutes") is not None else ""],
            ["Average service minutes", payload.get("avg_service_minutes") if payload.get("avg_service_minutes") is not None else ""],
            ["Patients seen", payload.get("patients_seen", 0)],
            ["New patients", payload.get("new_patients", 0)],
            ["Encounters started", payload.get("encounters_started", 0)],
            ["Encounters completed", payload.get("encounters_completed", 0)],
        ]
    )
    book.section("Appointments by status", ["Status", "Count"], _count_rows(payload.get("appointments_by_status") or {}))
    book.section("Queue by status", ["Status", "Count"], _count_rows(payload.get("queue_by_status") or {}))
    hours = payload.get("peak_appointment_hours") or {}
    book.section(
        "Appointments by hour",
        ["Hour", "Appointments"],
        [[f"{hour}:00", count] for hour, count in sorted(hours.items(), key=lambda item: int(item[0]))],
    )
    book.section(
        "Registered patients by sex",
        ["Sex", "Patients"],
        _count_rows(payload.get("demographics_by_sex") or {}),
    )

    appointments = Appointment.objects.filter(
        clinic_id=clinic_id,
        starts_at__date__gte=start,
        starts_at__date__lte=end,
    )
    appointments = scope_branch(appointments, branch_id).select_related("patient", "doctor__staff__user").order_by("starts_at")
    book.section(
        "Appointment register",
        ["Starts", "Patient number", "Patient", "Doctor", "Status", "Visit reason", "Walk-in"],
        [
            [
                _stamp(appointment.starts_at, zone),
                appointment.patient.patient_number,
                appointment.patient.full_name,
                _doctor_name(appointment.doctor),
                _label(appointment.status),
                appointment.visit_reason,
                "Yes" if "walk-in" in (appointment.visit_reason or "").lower() else "No",
            ]
            for appointment in appointments
        ],
    )

    queue_entries = QueueEntry.objects.filter(
        clinic_id=clinic_id,
        service_date__gte=start,
        service_date__lte=end,
    )
    queue_entries = scope_branch(queue_entries, branch_id).select_related("patient", "doctor__staff__user").order_by(
        "service_date", "position"
    )
    book.section(
        "Queue register",
        ["Service date", "Position", "Patient number", "Patient", "Doctor", "Status"],
        [
            [
                entry.service_date.isoformat(),
                entry.position,
                entry.patient.patient_number,
                entry.patient.full_name,
                _doctor_name(entry.doctor),
                _label(entry.status),
            ]
            for entry in queue_entries
        ],
    )


def _clinical(book: CsvBook, payload: dict, clinic_id, branch_id, start, end) -> None:
    zone = payload.get("timezone") or "UTC"
    book.metrics(
        [
            ["Encounters", payload.get("encounter_count", 0)],
            ["Encounters completed", payload.get("encounters_completed", 0)],
            ["Average consult minutes", payload.get("avg_consult_minutes") if payload.get("avg_consult_minutes") is not None else ""],
            ["Prescriptions", payload.get("prescription_count", 0)],
            ["Prescription lines", payload.get("prescription_items", 0)],
            ["Prescribed quantity", payload.get("prescribed_quantity", 0)],
            ["Dispensed quantity", payload.get("dispensed_quantity", 0)],
            ["Fill rate %", payload.get("fill_rate_percent") if payload.get("fill_rate_percent") is not None else ""],
            ["Follow-ups due in 7 days", payload.get("follow_ups_due_7_days", 0)],
            ["Follow-ups due in 30 days", payload.get("follow_ups_due_30_days", 0)],
        ]
    )
    book.section("Encounters by status", ["Status", "Count"], _count_rows(payload.get("encounters_by_status") or {}))
    book.section("Prescriptions by status", ["Status", "Count"], _count_rows(payload.get("prescriptions_by_status") or {}))
    book.section(
        "Top diagnoses",
        ["Code", "Description", "Count"],
        [
            [row.get("code") or "", row.get("description") or "", row.get("count") or 0]
            for row in payload.get("top_diagnoses") or []
        ],
    )

    encounters = Encounter.objects.filter(
        clinic_id=clinic_id,
        started_at__date__gte=start,
        started_at__date__lte=end,
    )
    encounters = (
        scope_branch(encounters, branch_id)
        .select_related("patient", "doctor__staff__user")
        .prefetch_related("diagnosis_entries")
        .order_by("started_at")
    )
    rows = []
    for encounter in encounters:
        diagnoses = []
        for diagnosis in encounter.diagnosis_entries.all():
            if diagnosis.status != "active":
                continue
            text = diagnosis.description.strip()
            if diagnosis.code:
                text = f"{diagnosis.code} {text}".strip()
            diagnoses.append(text)
        rows.append(
            [
                _stamp(encounter.started_at, zone),
                encounter.patient.patient_number,
                encounter.patient.full_name,
                _doctor_name(encounter.doctor),
                _label(encounter.status),
                "; ".join(diagnoses),
            ]
        )
    book.section(
        "Consultation register",
        ["Started", "Patient number", "Patient", "Doctor", "Status", "Diagnoses"],
        rows,
    )


def _pharmacy(book: CsvBook, payload: dict) -> None:
    zone = payload.get("timezone") or "UTC"
    movement = payload.get("movement_summary") or {}
    totals = payload.get("ledger_totals") or {}
    book.metrics(
        [
            ["Medicines", payload.get("medicines_tracked", 0)],
            ["Opening balance", totals.get("opening_balance", 0)],
            ["Received", movement.get("stock_in_units", 0)],
            ["Used", movement.get("used_units", movement.get("dispense_units", 0))],
            ["Adjustment in", movement.get("adjustment_in_units", 0)],
            ["Adjustment out", movement.get("adjustment_out_units", 0)],
            ["Transfer in", movement.get("transfer_in_units", 0)],
            ["Transfer out", movement.get("transfer_out_units", 0)],
            ["Remaining balance", payload.get("total_units_on_hand", 0)],
            ["Low or out of stock", payload.get("low_stock_count", 0)],
            ["Units expiring within 30 days", payload.get("expiring_within_30_days", 0)],
            ["Units expiring in 31–60 days", payload.get("expiring_within_60_days", 0)],
            ["Units expiring in 61–90 days", payload.get("expiring_within_90_days", 0)],
        ]
    )
    book.blank()
    book.writer.writerow(
        ["Remaining balance = opening + received + adjustment in + transfer in − used − adjustment out − transfer out"]
    )

    ledger_rows = []
    for row in payload.get("inventory_ledger") or []:
        ledger_rows.append(
            [
                row.get("medicine_code") or "",
                row.get("medicine_name") or "",
                row.get("strength") or "",
                row.get("category") or "",
                row.get("unit") or "",
                row.get("opening_balance", 0),
                row.get("received", 0),
                row.get("used", 0),
                row.get("adjustment_in", 0),
                row.get("adjustment_out", 0),
                row.get("transfer_in", 0),
                row.get("transfer_out", 0),
                row.get("remaining_balance", 0),
                row.get("reorder_level", 0),
                _label(row.get("status")),
                row.get("nearest_expiry") or "",
            ]
        )
    if totals:
        ledger_rows.append(
            [
                "",
                "Total",
                "",
                "",
                "",
                totals.get("opening_balance", 0),
                totals.get("received", 0),
                totals.get("used", 0),
                totals.get("adjustment_in", 0),
                totals.get("adjustment_out", 0),
                totals.get("transfer_in", 0),
                totals.get("transfer_out", 0),
                totals.get("remaining_balance", 0),
                "",
                "",
                "",
            ]
        )
    book.section(
        "Inventory ledger",
        [
            "Code",
            "Medicine",
            "Strength",
            "Category",
            "Unit",
            "Opening balance",
            "Received",
            "Used",
            "Adjustment in",
            "Adjustment out",
            "Transfer in",
            "Transfer out",
            "Remaining balance",
            "Reorder level",
            "Status",
            "Nearest expiry",
        ],
        ledger_rows,
    )
    book.section(
        "Stock movements",
        ["Recorded", "Code", "Medicine", "Batch", "Branch", "Movement", "Direction", "Quantity", "Signed quantity", "Reason", "Recorded by"],
        [
            [
                _stamp(line.get("recorded_at"), zone),
                line.get("medicine_code") or "",
                line.get("medicine_name") or "",
                line.get("batch_number") or "",
                line.get("branch_name") or "",
                line.get("kind_label") or _label(line.get("kind")),
                _label(line.get("direction")),
                line.get("quantity", 0),
                line.get("signed_quantity", 0),
                line.get("reason") or "",
                line.get("recorded_by") or "",
            ]
            for line in payload.get("movement_lines") or []
        ],
    )
    book.section(
        "Current batches on hand",
        ["Batch", "Code", "Medicine", "Branch", "Role", "Quantity", "Expiry", "Supplier"],
        [
            [
                row.get("batch_number") or "",
                row.get("medicine_code") or "",
                row.get("medicine_name") or "",
                row.get("branch_name") or "",
                _label(row.get("branch_role")),
                row.get("quantity_on_hand", 0),
                row.get("expiry_date") or "",
                row.get("supplier_name") or "",
            ]
            for row in payload.get("batch_register") or []
        ],
    )


def _laboratory(book: CsvBook, payload: dict, clinic_id, branch_id, start, end) -> None:
    zone = payload.get("timezone") or "UTC"
    book.metrics(
        [
            ["Lab orders", payload.get("order_count", 0)],
            ["Completed orders", payload.get("completed_orders", 0)],
            ["Median turnaround hours", payload.get("median_turnaround_hours") if payload.get("median_turnaround_hours") is not None else ""],
            ["Results", payload.get("result_count", 0)],
            ["Abnormal results", payload.get("abnormal_result_count", 0)],
            ["Abnormal rate %", payload.get("abnormal_rate_percent") if payload.get("abnormal_rate_percent") is not None else ""],
        ]
    )
    book.section("Orders by status", ["Status", "Count"], _count_rows(payload.get("orders_by_status") or {}))
    book.section(
        "Tests by volume",
        ["Code", "Test", "Orders"],
        [
            [row.get("code") or "", row.get("name") or "", row.get("count") or 0]
            for row in payload.get("tests_by_volume") or []
        ],
    )
    book.section(
        "Results by interpretation",
        ["Interpretation", "Count"],
        _count_rows(payload.get("interpretation_breakdown") or {}),
    )

    orders = LabOrder.objects.filter(clinic_id=clinic_id, created_at__date__gte=start, created_at__date__lte=end)
    orders = (
        scope_branch(orders, branch_id)
        .select_related("patient", "doctor__staff__user")
        .prefetch_related("items__lab_test")
        .order_by("created_at")
    )
    book.section(
        "Lab order register",
        ["Ordered", "Patient number", "Patient", "Doctor", "Status", "Tests", "Reported"],
        [
            [
                _stamp(order.created_at, zone),
                order.patient.patient_number,
                order.patient.full_name,
                _doctor_name(order.doctor),
                _label(order.status),
                "; ".join(f"{item.lab_test.code} {item.lab_test.name}" for item in order.items.all()),
                _stamp(order.reported_at, zone),
            ]
            for order in orders
        ],
    )

    results = LabResult.objects.filter(
        clinic_id=clinic_id,
        status=LabResult.Status.ACTIVE,
        recorded_at__date__gte=start,
        recorded_at__date__lte=end,
    )
    results = scope_branch(results, branch_id).select_related("patient", "order_item__lab_test").order_by("recorded_at")
    book.section(
        "Result register",
        ["Recorded", "Patient number", "Patient", "Test", "Value", "Unit", "Interpretation"],
        [
            [
                _stamp(result.recorded_at, zone),
                result.patient.patient_number,
                result.patient.full_name,
                result.order_item.lab_test.name,
                result.value,
                result.unit,
                _label(result.interpretation),
            ]
            for result in results
        ],
    )


def _trend_summary(book: CsvBook, payload: dict) -> None:
    comparison = payload.get("comparison") or {}

    def current(key: str, default: object = 0) -> object:
        return (comparison.get(key) or {}).get("current", default)

    book.metrics(
        [
            ["Payments collected", current("payments_collected", "0.00")],
            ["Issued total", current("issued_total", "0.00")],
            ["Appointments", current("appointments", 0)],
            ["Encounters", current("encounters", 0)],
        ]
    )


def _trends(book: CsvBook, payload: dict) -> None:
    comparison = payload.get("comparison") or {}
    rows = []
    labels = {
        "payments_collected": "Payments collected",
        "issued_total": "Issued total",
        "appointments": "Appointments",
        "encounters": "Encounters",
    }
    for key, label in labels.items():
        row = comparison.get(key) or {}
        change = row.get("change_percent")
        rows.append(
            [
                label,
                row.get("current", ""),
                row.get("prior", ""),
                "" if change is None else change,
            ]
        )
    prior_from = comparison.get("prior_from") or ""
    prior_to = comparison.get("prior_to") or ""
    book.blank()
    book.writer.writerow([f"Compared with {prior_from} to {prior_to}".strip()])
    book.section("Period comparison", ["Metric", "Current", "Prior", "Change %"], rows)
    book.section(
        "Daily activity",
        ["Date", "Payments collected", "Issued total", "Appointments", "Encounters"],
        [
            [
                point.get("date") or "",
                point.get("payments_collected") or "0.00",
                point.get("issued_total") or "0.00",
                point.get("appointments") or 0,
                point.get("encounters") or 0,
            ]
            for point in payload.get("series") or []
        ],
    )
