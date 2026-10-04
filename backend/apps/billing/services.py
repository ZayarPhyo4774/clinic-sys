from decimal import Decimal

from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from apps.billing.models import ZERO, Invoice, InvoiceItem, InvoiceNumberSequence, Payment, Refund, money


def next_invoice_number(clinic) -> str:
    with transaction.atomic():
        try:
            sequence, _ = InvoiceNumberSequence.objects.select_for_update().get_or_create(
                clinic=clinic,
                defaults={"last_value": 0},
            )
        except IntegrityError:
            sequence = InvoiceNumberSequence.objects.select_for_update().get(clinic=clinic)
        sequence.last_value += 1
        sequence.save(update_fields=["last_value", "updated_at"])
        return f"{sequence.last_value:06d}"


def _lock_invoice(invoice_id) -> Invoice:
    # tax_rate is optional. Locking a select_related of that join makes
    # Postgres reject FOR UPDATE on the outer join.
    return Invoice.objects.select_for_update().get(pk=invoice_id)


def _net(invoice: Invoice) -> tuple[Decimal, Decimal, Decimal]:
    paid = invoice.payments.aggregate(total=Sum("amount"))["total"] or ZERO
    refunded = Refund.objects.filter(payment__invoice=invoice).aggregate(total=Sum("amount"))["total"] or ZERO
    return paid, refunded, paid - refunded


def balance_of(invoice: Invoice) -> Decimal:
    _paid, _refunded, net = _net(invoice)
    return money(invoice.total - net)


def apply_totals(invoice: Invoice) -> Invoice:
    subtotal = ZERO
    discount_total = ZERO
    for item in invoice.items.all():
        subtotal += item.line_total
        discount_total += item.discount_amount
    subtotal = money(subtotal)
    discount_total = money(discount_total)
    if invoice.tax_rate_id:
        rate = invoice.tax_rate
        if not rate.is_active:
            raise ValidationError({"tax_rate": "Tax rate is not active."})
        tax_percent = rate.rate
        tax_amount = money(subtotal * rate.rate / Decimal("100"))
    else:
        tax_percent = Decimal("0.000")
        tax_amount = ZERO
    invoice.subtotal = subtotal
    invoice.discount_total = discount_total
    invoice.tax_percent = tax_percent
    invoice.tax_amount = tax_amount
    invoice.total = money(subtotal + tax_amount)
    return invoice


def refresh_status(invoice: Invoice) -> Invoice:
    if invoice.status in {Invoice.Status.DRAFT, Invoice.Status.CANCELLED}:
        return invoice
    paid, refunded, net = _net(invoice)
    net = money(net)
    if net == invoice.total:
        new_status = Invoice.Status.PAID if invoice.total > 0 or paid > 0 else invoice.status
        if invoice.total == 0:
            new_status = invoice.status
    elif net > invoice.total:
        raise ValidationError({"amount": "Amount is greater than the balance."})
    elif net == 0 and refunded > 0 and paid >= invoice.total and refunded >= paid and invoice.total > 0:
        new_status = Invoice.Status.REFUNDED
    elif net == 0:
        new_status = Invoice.Status.ISSUED
    else:
        new_status = Invoice.Status.PARTIALLY_PAID
    if new_status != invoice.status:
        invoice.status = new_status
        invoice.save(update_fields=["status", "updated_at"])
    return invoice


def create_invoice(*, encounter, user) -> Invoice:
    with transaction.atomic():
        invoice = Invoice(
            encounter=encounter,
            created_by=user,
            invoice_number=next_invoice_number(encounter.clinic),
            status=Invoice.Status.DRAFT,
        )
        invoice.save()
        return invoice


def create_manual_invoice(*, patient, doctor, branch, user) -> Invoice:
    with transaction.atomic():
        invoice = Invoice(
            patient=patient,
            doctor=doctor,
            branch=branch,
            clinic=branch.clinic,
            currency=branch.clinic.currency,
            created_by=user,
            invoice_number=next_invoice_number(branch.clinic),
            status=Invoice.Status.DRAFT,
        )
        invoice.save()
        return invoice


def set_tax_rate(*, invoice_id, tax_rate) -> Invoice:
    with transaction.atomic():
        invoice = _lock_invoice(invoice_id)
        if invoice.status != Invoice.Status.DRAFT:
            raise ValidationError({"tax_rate": "Tax can change only on a draft."})
        invoice.tax_rate = tax_rate
        apply_totals(invoice)
        invoice._totals_update = True
        invoice.save()
        return invoice


def add_item(*, invoice_id, user, **fields) -> InvoiceItem:
    with transaction.atomic():
        invoice = _lock_invoice(invoice_id)
        if invoice.status != Invoice.Status.DRAFT:
            raise ValidationError("Charges can change only on a draft invoice.")
        item = InvoiceItem(invoice=invoice, created_by=user, **fields)
        item.save()
        apply_totals(invoice)
        invoice._totals_update = True
        invoice.save()
        return item


def update_item(*, item_id, **fields) -> InvoiceItem:
    with transaction.atomic():
        item = InvoiceItem.objects.select_related("invoice").get(pk=item_id)
        invoice = _lock_invoice(item.invoice_id)
        if invoice.status != Invoice.Status.DRAFT:
            raise ValidationError("Charges can change only on a draft invoice.")
        item = InvoiceItem.objects.select_related(
            "invoice",
            "prescription_item__medicine",
            "lab_order_item__lab_test",
        ).get(pk=item_id)
        for name, value in fields.items():
            setattr(item, name, value)
        item.invoice = invoice
        item.save()
        apply_totals(invoice)
        invoice._totals_update = True
        invoice.save()
        return item


def issue_invoice(invoice_id, user) -> Invoice:
    with transaction.atomic():
        invoice = _lock_invoice(invoice_id)
        if invoice.status != Invoice.Status.DRAFT:
            raise ValidationError({"status": "This status change is not allowed."})
        if not invoice.items.exists():
            raise ValidationError({"status": "Add a charge before issuing the invoice."})
        apply_totals(invoice)
        invoice.status = Invoice.Status.ISSUED
        invoice.issued_at = timezone.now()
        invoice.issued_by = user
        invoice._totals_update = True
        invoice.save()
        return invoice


def cancel_invoice(invoice_id) -> Invoice:
    with transaction.atomic():
        invoice = _lock_invoice(invoice_id)
        if invoice.status not in {Invoice.Status.DRAFT, Invoice.Status.ISSUED}:
            raise ValidationError({"status": "This status change is not allowed."})
        if invoice.payments.exists():
            raise ValidationError({"status": "This invoice can no longer be cancelled."})
        invoice.status = Invoice.Status.CANCELLED
        invoice.save(update_fields=["status", "updated_at"])
        return invoice


def record_payment(*, invoice_id, method, amount, user) -> Payment:
    with transaction.atomic():
        invoice = _lock_invoice(invoice_id)
        if invoice.status not in Invoice.OPEN_FOR_PAYMENT:
            raise ValidationError({"status": "This invoice cannot take a payment."})
        amount = money(amount)
        if amount > balance_of(invoice):
            raise ValidationError({"amount": "Amount is greater than the balance."})
        payment = Payment(invoice=invoice, method=method, amount=amount, recorded_by=user)
        payment.save()
        refresh_status(invoice)
        payment.invoice = invoice
        return payment


def record_refund(*, payment_id, amount, reason, user) -> Refund:
    with transaction.atomic():
        payment = Payment.objects.select_related("invoice").get(pk=payment_id)
        invoice = _lock_invoice(payment.invoice_id)
        payment = Payment.objects.select_for_update().get(pk=payment_id)
        if invoice.status not in Invoice.OPEN_FOR_REFUND:
            raise ValidationError({"status": "This payment cannot be refunded."})
        amount = money(amount)
        already = payment.refunds.aggregate(total=Sum("amount"))["total"] or ZERO
        remaining = money(payment.amount - already)
        if amount > remaining:
            raise ValidationError({"amount": "Amount is greater than the remaining payment."})
        refund = Refund(payment=payment, amount=amount, reason=reason, recorded_by=user)
        refund.save()
        refresh_status(invoice)
        refund.payment.invoice = invoice
        return refund
