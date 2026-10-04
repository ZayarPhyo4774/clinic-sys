import uuid
from decimal import Decimal, ROUND_HALF_UP

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone

from apps.encounters.models import Encounter

MONEY = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value) -> Decimal:
    return Decimal(value).quantize(MONEY, rounding=ROUND_HALF_UP)


class PaymentMethod(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="payment_methods")
    name = models.CharField(max_length=120)
    code = models.SlugField(max_length=50)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_payment_methods",
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "code"], name="payment_method_code_uniq"),
        ]

    def clean(self):
        if not (self.name or "").strip():
            raise ValidationError({"name": "Name is required."})
        if not (self.code or "").strip():
            raise ValidationError({"code": "Code is required."})
        code = (self.code or "").strip().lower()
        if self.clinic_id and code:
            conflict = PaymentMethod.objects.filter(clinic_id=self.clinic_id, code=code)
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"code": "A payment method with this code already exists."})

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.code = (self.code or "").strip().lower()
        previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
        if previous is not None and previous.code != self.code:
            raise ValidationError({"code": "Code cannot change."})
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.code


class TaxRate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="tax_rates")
    name = models.CharField(max_length=120)
    code = models.SlugField(max_length=50)
    rate = models.DecimalField(max_digits=6, decimal_places=3)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_tax_rates",
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "code"], name="tax_rate_code_uniq"),
            models.CheckConstraint(condition=Q(rate__gte=0) & Q(rate__lte=100), name="tax_rate_percent_range"),
        ]

    def clean(self):
        if not (self.name or "").strip():
            raise ValidationError({"name": "Name is required."})
        if self.rate is None or self.rate < 0 or self.rate > 100:
            raise ValidationError({"rate": "Rate must be between 0 and 100."})
        code = (self.code or "").strip().lower()
        if self.clinic_id and code:
            conflict = TaxRate.objects.filter(clinic_id=self.clinic_id, code=code)
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"code": "A tax rate with this code already exists."})

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.code = (self.code or "").strip().lower()
        previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
        if previous is not None and previous.code != self.code:
            raise ValidationError({"code": "Code cannot change."})
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.code


class InvoiceNumberSequence(models.Model):
    clinic = models.OneToOneField(
        "clinics.Clinic",
        on_delete=models.PROTECT,
        related_name="invoice_number_sequence",
    )
    last_value = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return str(self.last_value)


class InvoiceQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("Invoices cannot be changed this way.")

    def delete(self):
        raise ValidationError("Invoices cannot be deleted.")


class Invoice(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        ISSUED = "issued", "Issued"
        PARTIALLY_PAID = "partially_paid", "Partially paid"
        PAID = "paid", "Paid"
        CANCELLED = "cancelled", "Cancelled"
        REFUNDED = "refunded", "Refunded"

    TRANSITIONS = {
        Status.DRAFT: {Status.ISSUED, Status.CANCELLED},
        Status.ISSUED: {Status.PARTIALLY_PAID, Status.PAID, Status.CANCELLED},
        Status.PARTIALLY_PAID: {Status.PAID, Status.ISSUED, Status.REFUNDED},
        Status.PAID: {Status.PARTIALLY_PAID, Status.REFUNDED},
        Status.CANCELLED: set(),
        Status.REFUNDED: set(),
    }
    OPEN_FOR_PAYMENT = {Status.ISSUED, Status.PARTIALLY_PAID}
    OPEN_FOR_REFUND = {Status.PARTIALLY_PAID, Status.PAID}
    SETTLED = {Status.CANCELLED, Status.REFUNDED}

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="invoices")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="invoices")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="invoices")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="invoices")
    encounter = models.ForeignKey(
        Encounter,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    invoice_number = models.CharField(max_length=20)
    currency = models.CharField(max_length=3)
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.DRAFT)
    tax_rate = models.ForeignKey(
        TaxRate,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="invoices",
    )
    tax_percent = models.DecimalField(max_digits=6, decimal_places=3, default=ZERO)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    discount_total = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    tax_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    issued_at = models.DateTimeField(null=True, blank=True)
    issued_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="issued_invoices",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_invoices",
    )

    objects = InvoiceQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "invoice_number"], name="invoice_number_uniq"),
            models.CheckConstraint(condition=Q(subtotal__gte=0), name="invoice_subtotal_nonneg"),
            models.CheckConstraint(condition=Q(discount_total__gte=0), name="invoice_discount_nonneg"),
            models.CheckConstraint(condition=Q(tax_amount__gte=0), name="invoice_tax_nonneg"),
            models.CheckConstraint(condition=Q(total__gte=0), name="invoice_total_nonneg"),
        ]
        indexes = [
            models.Index(fields=["patient", "created_at"], name="bill_invoice_patient_idx"),
            models.Index(fields=["branch", "status"], name="bill_invoice_status_idx"),
        ]

    def clean(self):
        if self.tax_rate_id and self.clinic_id and self.tax_rate.clinic_id != self.clinic_id:
            raise ValidationError({"tax_rate": "Tax rate is outside this clinic."})
        if self._state.adding and self.status != self.Status.DRAFT:
            raise ValidationError({"status": "New invoices start as drafts."})
        if self._state.adding and not self.encounter_id:
            if not all([self.patient_id, self.doctor_id, self.branch_id, self.clinic_id]):
                raise ValidationError("Manual invoices need a patient, doctor, and branch.")
            if self.patient.clinic_id != self.clinic_id:
                raise ValidationError({"patient": "Patient is outside this clinic."})
            if self.doctor.staff.clinic_id != self.clinic_id:
                raise ValidationError({"doctor": "Doctor is outside this clinic."})
            if self.branch.clinic_id != self.clinic_id:
                raise ValidationError({"branch": "Branch is outside this clinic."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self._state.adding and self.encounter_id:
                encounter = Encounter.objects.select_for_update().select_related("clinic").get(pk=self.encounter_id)
                self.patient_id = encounter.patient_id
                self.doctor_id = encounter.doctor_id
                self.branch_id = encounter.branch_id
                self.clinic_id = encounter.clinic_id
                self.currency = encounter.clinic.currency
                self.encounter = encounter
            elif self._state.adding and not self.encounter_id:
                if not self.currency:
                    from apps.clinics.models import Clinic

                    clinic = Clinic.objects.get(pk=self.clinic_id)
                    self.currency = clinic.currency
            previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
            if previous is not None:
                for field in (
                    "encounter_id",
                    "patient_id",
                    "doctor_id",
                    "branch_id",
                    "clinic_id",
                    "invoice_number",
                    "currency",
                    "created_by_id",
                ):
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError("Invoice attribution cannot change.")
                money_fields = ("subtotal", "discount_total", "tax_percent", "tax_amount", "total", "tax_rate_id")
                if not getattr(self, "_totals_update", False):
                    for field in money_fields:
                        if getattr(previous, field) != getattr(self, field):
                            raise ValidationError("Invoice totals cannot change this way.")
                if self.status != previous.status and self.status not in self.TRANSITIONS[previous.status]:
                    raise ValidationError({"status": "This status change is not allowed."})
                if previous.issued_at is not None and (
                    self.issued_at != previous.issued_at or self.issued_by_id != previous.issued_by_id
                ):
                    raise ValidationError("Issue metadata cannot change.")
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Invoices cannot be deleted.")

    def __str__(self) -> str:
        return self.invoice_number


class InvoiceItemQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("Invoice items cannot be changed this way.")

    def delete(self):
        raise ValidationError("Invoice items cannot be deleted.")


class InvoiceItem(models.Model):
    class Kind(models.TextChoices):
        CONSULTATION = "consultation", "Consultation"
        PHARMACY = "pharmacy", "Pharmacy"
        LABORATORY = "laboratory", "Laboratory"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="items")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="invoice_items")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="invoice_items")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="invoice_items")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    prescription_item = models.ForeignKey(
        "prescriptions.PrescriptionItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="invoice_items",
    )
    lab_order_item = models.ForeignKey(
        "laboratory.LabOrderItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="invoice_items",
    )
    description = models.CharField(max_length=50)
    quantity = models.PositiveIntegerField()
    unit_price = models.DecimalField(max_digits=12, decimal_places=2)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=ZERO)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_invoice_items",
    )

    objects = InvoiceItemQuerySet.as_manager()

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gte=1), name="invoice_item_qty_pos"),
            models.CheckConstraint(condition=Q(unit_price__gt=0), name="invoice_item_price_pos"),
            models.CheckConstraint(condition=Q(discount_amount__gte=0), name="invoice_item_discount_nonneg"),
        ]

    @property
    def line_total(self) -> Decimal:
        return money(self.unit_price * self.quantity - self.discount_amount)

    def clean(self):
        if self.invoice_id:
            self.patient_id = self.invoice.patient_id
            self.branch_id = self.invoice.branch_id
            self.clinic_id = self.invoice.clinic_id
        if self.quantity is None or self.quantity < 1:
            raise ValidationError({"quantity": "Quantity must be at least 1."})
        if self.unit_price is None or self.unit_price <= 0:
            raise ValidationError({"unit_price": "Unit price must be greater than zero."})
        if self.discount_amount is None or self.discount_amount < 0:
            raise ValidationError({"discount_amount": "Discount cannot be negative."})
        if self.discount_amount > self.unit_price * self.quantity:
            raise ValidationError({"discount_amount": "Discount cannot exceed the charge."})
        if self.invoice_id and self.invoice.status != Invoice.Status.DRAFT and (
            self._state.adding or getattr(self, "_amount_update", False)
        ):
            raise ValidationError("Charges can change only on a draft invoice.")
        self._check_source()

    def _check_source(self):
        if self.kind == self.Kind.CONSULTATION:
            if self.prescription_item_id or self.lab_order_item_id:
                raise ValidationError({"kind": "A consultation charge stands alone."})
            if self.quantity != 1:
                raise ValidationError({"quantity": "A consultation charge has quantity 1."})
            if self.invoice.encounter_id:
                conflict = InvoiceItem.objects.filter(
                    kind=self.Kind.CONSULTATION,
                    invoice__encounter_id=self.invoice.encounter_id,
                ).exclude(invoice__status__in=Invoice.SETTLED)
            else:
                conflict = InvoiceItem.objects.none()
        elif self.kind == self.Kind.PHARMACY:
            if not self.invoice.encounter_id:
                raise ValidationError({"kind": "Pharmacy charges need an encounter-linked invoice."})
            if not self.prescription_item_id or self.lab_order_item_id:
                raise ValidationError({"prescription_item": "A pharmacy charge needs a dispensed item."})
            source = self.prescription_item
            if source.prescription.encounter_id != self.invoice.encounter_id:
                raise ValidationError({"prescription_item": "This charge is for a different encounter."})
            if source.clinic_id != self.invoice.clinic_id:
                raise ValidationError({"prescription_item": "This charge is outside this clinic."})
            if self.quantity > source.quantity_dispensed:
                raise ValidationError({"quantity": "Quantity is greater than the quantity dispensed."})
            conflict = InvoiceItem.objects.filter(prescription_item_id=self.prescription_item_id).exclude(
                invoice__status__in=Invoice.SETTLED
            )
        elif self.kind == self.Kind.LABORATORY:
            if not self.invoice.encounter_id:
                raise ValidationError({"kind": "Laboratory charges need an encounter-linked invoice."})
            if not self.lab_order_item_id or self.prescription_item_id:
                raise ValidationError({"lab_order_item": "A laboratory charge needs a completed test."})
            source = self.lab_order_item
            if source.order.encounter_id != self.invoice.encounter_id:
                raise ValidationError({"lab_order_item": "This charge is for a different encounter."})
            if source.order.status != source.order.Status.COMPLETED and source.order.status != "completed":
                raise ValidationError({"lab_order_item": "The lab order is not completed."})
            if self.quantity != 1:
                raise ValidationError({"quantity": "A laboratory charge has quantity 1."})
            conflict = InvoiceItem.objects.filter(lab_order_item_id=self.lab_order_item_id).exclude(
                invoice__status__in=Invoice.SETTLED
            )
        else:
            raise ValidationError({"kind": "Unknown charge type."})
        if self.pk:
            conflict = conflict.exclude(pk=self.pk)
        if self.invoice_id and conflict.exists():
            raise ValidationError({"kind": "This charge is already on an invoice."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.invoice_id:
                self.patient_id = self.invoice.patient_id
                self.branch_id = self.invoice.branch_id
                self.clinic_id = self.invoice.clinic_id
            if self._state.adding:
                provided = (self.description or "").strip()
                self.description = provided[:50] if provided else _description(self)
            previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
            if previous is not None:
                for field in ("invoice_id", "kind", "prescription_item_id", "lab_order_item_id", "description"):
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError("Invoice item details cannot be changed.")
                amounts = ("quantity", "unit_price", "discount_amount")
                if any(getattr(previous, field) != getattr(self, field) for field in amounts):
                    self._amount_update = True
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Invoice items cannot be deleted.")

    def __str__(self) -> str:
        return self.kind


def _description(item: InvoiceItem) -> str:
    if item.kind == InvoiceItem.Kind.CONSULTATION:
        return "consultation"
    if item.kind == InvoiceItem.Kind.PHARMACY and item.prescription_item_id:
        return item.prescription_item.medicine.code
    if item.kind == InvoiceItem.Kind.LABORATORY and item.lab_order_item_id:
        return item.lab_order_item.lab_test.code
    return item.kind


class PaymentQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("Payments cannot be changed.")

    def delete(self):
        raise ValidationError("Payments cannot be deleted.")


class Payment(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name="payments")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="payments")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="payments")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="payments")
    method = models.ForeignKey(PaymentMethod, on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_at = models.DateTimeField(default=timezone.now)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="recorded_payments",
    )

    objects = PaymentQuerySet.as_manager()

    class Meta:
        ordering = ["paid_at"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="payment_amount_pos"),
        ]
        indexes = [
            models.Index(fields=["invoice", "paid_at"], name="bill_payment_invoice_idx"),
        ]

    def clean(self):
        if self.amount is None or self.amount <= 0:
            raise ValidationError({"amount": "Amount must be greater than zero."})
        if self.invoice_id:
            self.clinic_id = self.invoice.clinic_id
            self.branch_id = self.invoice.branch_id
            self.patient_id = self.invoice.patient_id
        if self.method_id and self.clinic_id and self.method.clinic_id != self.clinic_id:
            raise ValidationError({"method": "Payment method is outside this clinic."})
        if self._state.adding and self.method_id and not self.method.is_active:
            raise ValidationError({"method": "Payment method is not active."})

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Payments cannot be changed.")
        if self.invoice_id:
            self.clinic_id = self.invoice.clinic_id
            self.branch_id = self.invoice.branch_id
            self.patient_id = self.invoice.patient_id
        self.amount = money(self.amount)
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Payments cannot be deleted.")

    def __str__(self) -> str:
        return self.invoice.invoice_number


class RefundQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("Refunds cannot be changed.")

    def delete(self):
        raise ValidationError("Refunds cannot be deleted.")


class Refund(models.Model):
    class Reason(models.TextChoices):
        OVERPAYMENT = "overpayment", "Overpayment"
        CANCELLED_SERVICE = "cancelled_service", "Cancelled service"
        DUPLICATE = "duplicate", "Duplicate"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    payment = models.ForeignKey(Payment, on_delete=models.PROTECT, related_name="refunds")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="refunds")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="refunds")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="refunds")
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    reason = models.CharField(max_length=32, choices=Reason.choices)
    refunded_at = models.DateTimeField(default=timezone.now)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="recorded_refunds",
    )

    objects = RefundQuerySet.as_manager()

    class Meta:
        ordering = ["refunded_at"]
        constraints = [
            models.CheckConstraint(condition=Q(amount__gt=0), name="refund_amount_pos"),
        ]

    def clean(self):
        if self.amount is None or self.amount <= 0:
            raise ValidationError({"amount": "Amount must be greater than zero."})
        if not self.reason:
            raise ValidationError({"reason": "A refund needs a reason."})
        if self.payment_id:
            self.clinic_id = self.payment.clinic_id
            self.branch_id = self.payment.branch_id
            self.patient_id = self.payment.patient_id

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Refunds cannot be changed.")
        if self.payment_id:
            self.clinic_id = self.payment.clinic_id
            self.branch_id = self.payment.branch_id
            self.patient_id = self.payment.patient_id
        self.amount = money(self.amount)
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Refunds cannot be deleted.")

    def __str__(self) -> str:
        return self.reason
