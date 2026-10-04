import uuid
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F, Q
from django.utils import timezone

from apps.encounters.models import Encounter


def _lower(value: str) -> str:
    return (value or "").strip().lower()


class LabTest(models.Model):
    class Specimen(models.TextChoices):
        BLOOD = "blood", "Blood"
        URINE = "urine", "Urine"
        SWAB = "swab", "Swab"
        STOOL = "stool", "Stool"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="lab_tests")
    name = models.CharField(max_length=200)
    code = models.SlugField(max_length=50)
    specimen = models.CharField(max_length=20, choices=Specimen.choices, default=Specimen.BLOOD)
    unit = models.CharField(max_length=40, blank=True)
    reference_low = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    reference_high = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    reference_text = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_lab_tests",
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "code"], name="lab_test_code_uniq"),
            models.CheckConstraint(
                condition=(
                    Q(reference_low__isnull=True)
                    | Q(reference_high__isnull=True)
                    | Q(("reference_low__lt", F("reference_high")))
                ),
                name="lab_test_range_order",
            ),
        ]

    def clean(self):
        if not (self.name or "").strip():
            raise ValidationError({"name": "Name is required."})
        if not (self.code or "").strip():
            raise ValidationError({"code": "Code is required."})
        if (
            self.reference_low is not None
            and self.reference_high is not None
            and self.reference_low >= self.reference_high
        ):
            raise ValidationError({"reference_low": "Reference low must be less than reference high."})
        if self.clinic_id and self.code:
            conflict = LabTest.objects.filter(clinic_id=self.clinic_id, code=_lower(self.code))
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"code": "A test with this code already exists."})

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.code = _lower(self.code)
        self.unit = (self.unit or "").strip()
        self.reference_text = (self.reference_text or "").strip()
        previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
        if previous is not None and previous.code != self.code:
            raise ValidationError({"code": "Code cannot change."})
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.code


class LabOrderQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Lab orders cannot be deleted.")


class LabOrder(models.Model):
    class Status(models.TextChoices):
        ORDERED = "ordered", "Ordered"
        SAMPLE_COLLECTED = "sample_collected", "Sample collected"
        PROCESSING = "processing", "Processing"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    TRANSITIONS = {
        Status.ORDERED: {Status.SAMPLE_COLLECTED, Status.CANCELLED},
        Status.SAMPLE_COLLECTED: {Status.PROCESSING, Status.CANCELLED},
        Status.PROCESSING: {Status.COMPLETED, Status.CANCELLED},
        Status.COMPLETED: set(),
        Status.CANCELLED: set(),
    }
    OPENABLE = {Status.ORDERED, Status.SAMPLE_COLLECTED}

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    encounter = models.ForeignKey(Encounter, on_delete=models.PROTECT, related_name="lab_orders")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="lab_orders")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="lab_orders")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="lab_orders")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="lab_orders")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.ORDERED)
    reported_at = models.DateTimeField(null=True, blank=True)
    reported_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="reported_lab_orders",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_lab_orders",
    )

    objects = LabOrderQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["patient", "created_at"], name="lab_order_patient_idx"),
            models.Index(fields=["branch", "status"], name="lab_order_branch_status_idx"),
        ]

    def clean(self):
        if self._state.adding:
            if self.status != self.Status.ORDERED:
                raise ValidationError({"status": "New lab orders start as ordered."})
            if self.encounter_id and self.encounter.status != Encounter.Status.OPEN:
                raise ValidationError({"encounter": "The encounter is not open."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self._state.adding and self.encounter_id:
                encounter = Encounter.objects.select_for_update().get(pk=self.encounter_id)
                self.patient_id = encounter.patient_id
                self.doctor_id = encounter.doctor_id
                self.branch_id = encounter.branch_id
                self.clinic_id = encounter.clinic_id
                self.encounter = encounter
            previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
            if previous is not None:
                for field in ("encounter_id", "patient_id", "doctor_id", "branch_id", "clinic_id", "created_by_id"):
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError("Lab order attribution cannot change.")
                if self.status != previous.status and self.status not in self.TRANSITIONS[previous.status]:
                    raise ValidationError({"status": "This status change is not allowed."})
                if previous.reported_at is not None and (
                    self.reported_at != previous.reported_at or self.reported_by_id != previous.reported_by_id
                ):
                    raise ValidationError("Report metadata cannot change.")
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Lab orders cannot be deleted.")

    def __str__(self) -> str:
        return self.status


class LabOrderItemQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Lab order items cannot be deleted.")


class LabOrderItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(LabOrder, on_delete=models.PROTECT, related_name="items")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="lab_order_items")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="lab_order_items")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="lab_order_items")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="lab_order_items")
    lab_test = models.ForeignKey(LabTest, on_delete=models.PROTECT, related_name="order_items")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_lab_order_items",
    )

    objects = LabOrderItemQuerySet.as_manager()

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.UniqueConstraint(fields=["order", "lab_test"], name="lab_item_order_test_uniq"),
        ]

    def clean(self):
        if self.order_id:
            self.patient_id = self.order.patient_id
            self.doctor_id = self.order.doctor_id
            self.branch_id = self.order.branch_id
            self.clinic_id = self.order.clinic_id
        if self._state.adding and self.order_id and self.order.status not in LabOrder.OPENABLE:
            raise ValidationError({"order": "Tests cannot be added to this order."})
        if self.lab_test_id and self.clinic_id and self.lab_test.clinic_id != self.clinic_id:
            raise ValidationError({"lab_test": "Test is outside this clinic."})
        if self._state.adding and self.lab_test_id and not self.lab_test.is_active:
            raise ValidationError({"lab_test": "Test is not active."})
        if self.order_id and self.lab_test_id:
            conflict = LabOrderItem.objects.filter(order_id=self.order_id, lab_test_id=self.lab_test_id)
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"lab_test": "This test is already on the order."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.order_id:
                self.patient_id = self.order.patient_id
                self.doctor_id = self.order.doctor_id
                self.branch_id = self.order.branch_id
                self.clinic_id = self.order.clinic_id
            previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
            if previous is not None:
                for field in (
                    "order_id",
                    "lab_test_id",
                    "patient_id",
                    "doctor_id",
                    "branch_id",
                    "clinic_id",
                ):
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError("Lab order item details cannot be changed.")
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Lab order items cannot be deleted.")

    def __str__(self) -> str:
        return str(self.lab_test_id)


class LabResultQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Lab results cannot be deleted.")


class LabResult(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CORRECTED = "corrected", "Corrected"

    class Interpretation(models.TextChoices):
        NORMAL = "normal", "Normal"
        LOW = "low", "Low"
        HIGH = "high", "High"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order_item = models.ForeignKey(LabOrderItem, on_delete=models.PROTECT, related_name="results")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="lab_results")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="lab_results")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="lab_results")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="lab_results")
    value = models.CharField(max_length=255)
    unit = models.CharField(max_length=40, blank=True)
    reference_low = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    reference_high = models.DecimalField(max_digits=10, decimal_places=3, null=True, blank=True)
    reference_text = models.CharField(max_length=255, blank=True)
    interpretation = models.CharField(max_length=20, choices=Interpretation.choices, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    supersedes = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="corrections",
    )
    recorded_at = models.DateTimeField(default=timezone.now)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="recorded_lab_results",
    )
    verified_at = models.DateTimeField(null=True, blank=True)
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="verified_lab_results",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = LabResultQuerySet.as_manager()

    class Meta:
        ordering = ["recorded_at"]
        constraints = [
            models.CheckConstraint(
                condition=(
                    Q(reference_low__isnull=True)
                    | Q(reference_high__isnull=True)
                    | Q(("reference_low__lt", F("reference_high")))
                ),
                name="lab_result_range_order",
            ),
        ]
        indexes = [
            models.Index(fields=["order_item", "status"], name="lab_result_item_status_idx"),
        ]

    def clean(self):
        if not (self.value or "").strip():
            raise ValidationError({"value": "Value is required."})
        if self.order_item_id:
            item = self.order_item
            self.patient_id = item.patient_id
            self.doctor_id = item.doctor_id
            self.branch_id = item.branch_id
            self.clinic_id = item.clinic_id
        if self.supersedes_id and self.order_item_id and self.supersedes.order_item_id != self.order_item_id:
            raise ValidationError({"supersedes": "Choose a result for this test."})
        if self._state.adding and self.status == self.Status.ACTIVE and self.order_item_id:
            existing = LabResult.objects.filter(order_item_id=self.order_item_id, status=self.Status.ACTIVE)
            if existing.exists():
                raise ValidationError({"value": "This test already has an active result."})
        if (
            self.reference_low is not None
            and self.reference_high is not None
            and self.reference_low >= self.reference_high
        ):
            raise ValidationError({"reference_low": "Reference low must be less than reference high."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            self.value = (self.value or "").strip()
            if self._state.adding and self.order_item_id:
                test = self.order_item.lab_test
                self.unit = test.unit
                self.reference_low = test.reference_low
                self.reference_high = test.reference_high
                self.reference_text = test.reference_text
                self.interpretation = _interpretation(self.value, self.reference_low, self.reference_high)
                self.patient_id = self.order_item.patient_id
                self.doctor_id = self.order_item.doctor_id
                self.branch_id = self.order_item.branch_id
                self.clinic_id = self.order_item.clinic_id
            previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
            if previous is not None:
                locked = (
                    "order_item_id",
                    "value",
                    "unit",
                    "reference_low",
                    "reference_high",
                    "reference_text",
                    "interpretation",
                    "supersedes_id",
                    "patient_id",
                    "doctor_id",
                    "branch_id",
                    "clinic_id",
                    "recorded_by_id",
                    "recorded_at",
                )
                for field in locked:
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError("Lab result details cannot be changed.")
                if previous.status != self.status and not (
                    previous.status == self.Status.ACTIVE and self.status == self.Status.CORRECTED
                ):
                    raise ValidationError({"status": "This status change is not allowed."})
                verification_changed = (
                    previous.verified_at != self.verified_at or previous.verified_by_id != self.verified_by_id
                )
                if verification_changed and not getattr(self, "_verify_update", False):
                    raise ValidationError("Verification changes only through the verify action.")
                if previous.verified_at is not None and verification_changed:
                    raise ValidationError("This result is already verified.")
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Lab results cannot be deleted.")

    def __str__(self) -> str:
        return self.status


def _interpretation(value: str, low, high) -> str:
    if low is None and high is None:
        return ""
    try:
        number = Decimal(value)
    except (InvalidOperation, TypeError):
        return ""
    if low is not None and number < low:
        return LabResult.Interpretation.LOW
    if high is not None and number > high:
        return LabResult.Interpretation.HIGH
    return LabResult.Interpretation.NORMAL
