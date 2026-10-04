import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import Q
from django.utils import timezone
from zoneinfo import ZoneInfo


def _lower(value: str) -> str:
    return (value or "").strip().lower()


class MedicineCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="medicine_categories")
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
        related_name="created_medicine_categories",
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "code"], name="med_category_code_uniq"),
        ]

    def clean(self):
        if not (self.name or "").strip():
            raise ValidationError({"name": "Name is required."})
        if not (self.code or "").strip():
            raise ValidationError({"code": "Code is required."})
        if self.clinic_id and self.code:
            conflict = MedicineCategory.objects.filter(clinic_id=self.clinic_id, code=_lower(self.code))
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"code": "A category with this code already exists."})

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.code = _lower(self.code)
        previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
        if previous is not None and previous.code != self.code:
            raise ValidationError({"code": "Code cannot change."})
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.code


class Medicine(models.Model):
    class Form(models.TextChoices):
        TABLET = "tablet", "Tablet"
        CAPSULE = "capsule", "Capsule"
        SYRUP = "syrup", "Syrup"
        INJECTION = "injection", "Injection"
        CREAM = "cream", "Cream"
        OTHER = "other", "Other"

    class Unit(models.TextChoices):
        TABLET = "tablet", "Tablet"
        CAPSULE = "capsule", "Capsule"
        MILLILITRE = "ml", "Millilitre"
        VIAL = "vial", "Vial"
        TUBE = "tube", "Tube"
        PIECE = "piece", "Piece"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="medicines")
    category = models.ForeignKey(MedicineCategory, on_delete=models.PROTECT, related_name="medicines")
    name = models.CharField(max_length=200)
    code = models.SlugField(max_length=50)
    form = models.CharField(max_length=20, choices=Form.choices)
    strength = models.CharField(max_length=60)
    unit = models.CharField(max_length=20, choices=Unit.choices)
    reorder_level = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_medicines",
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "code"], name="medicine_code_uniq"),
        ]

    def clean(self):
        if not (self.name or "").strip():
            raise ValidationError({"name": "Name is required."})
        if not (self.strength or "").strip():
            raise ValidationError({"strength": "Strength is required."})
        if self.category_id and self.clinic_id and self.category.clinic_id != self.clinic_id:
            raise ValidationError({"category": "Category is outside this clinic."})
        if self._state.adding and self.category_id and not self.category.is_active:
            raise ValidationError({"category": "Category is not active."})
        if self.clinic_id and self.code:
            conflict = Medicine.objects.filter(clinic_id=self.clinic_id, code=_lower(self.code))
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"code": "A medicine with this code already exists."})

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.strength = (self.strength or "").strip()
        self.code = _lower(self.code)
        if self.category_id:
            self.clinic_id = self.category.clinic_id
        previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
        if previous is not None and previous.code != self.code:
            raise ValidationError({"code": "Code cannot change."})
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.code


class Supplier(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="suppliers")
    name = models.CharField(max_length=200)
    code = models.SlugField(max_length=50)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_suppliers",
    )

    class Meta:
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "code"], name="supplier_code_uniq"),
        ]

    def clean(self):
        if not (self.name or "").strip():
            raise ValidationError({"name": "Name is required."})
        if self.clinic_id and self.code:
            conflict = Supplier.objects.filter(clinic_id=self.clinic_id, code=_lower(self.code))
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"code": "A supplier with this code already exists."})

    def save(self, *args, **kwargs):
        self.name = (self.name or "").strip()
        self.code = _lower(self.code)
        previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
        if previous is not None and previous.code != self.code:
            raise ValidationError({"code": "Code cannot change."})
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.code


class MedicineBatchQuerySet(models.QuerySet):
    def update(self, **kwargs):
        if "quantity_on_hand" in kwargs:
            raise ValidationError("Stock changes must be recorded as transactions.")
        return super().update(**kwargs)


class MedicineBatch(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="medicine_batches")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="medicine_batches")
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT, related_name="batches")
    supplier = models.ForeignKey(
        Supplier,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="batches",
    )
    batch_number = models.CharField(max_length=60)
    expiry_date = models.DateField()
    quantity_on_hand = models.PositiveIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_medicine_batches",
    )

    objects = MedicineBatchQuerySet.as_manager()

    class Meta:
        ordering = ["expiry_date", "batch_number"]
        constraints = [
            models.UniqueConstraint(
                fields=["branch", "medicine", "batch_number"],
                name="batch_branch_medicine_number_uniq",
            ),
            models.CheckConstraint(condition=Q(quantity_on_hand__gte=0), name="batch_quantity_nonneg"),
        ]
        indexes = [
            models.Index(fields=["branch", "expiry_date"], name="batch_branch_expiry_idx"),
            models.Index(fields=["medicine", "is_active"], name="batch_medicine_active_idx"),
        ]

    def clean(self):
        if not (self.batch_number or "").strip():
            raise ValidationError({"batch_number": "Batch number is required."})
        if self.branch_id:
            self.clinic_id = self.branch.clinic_id
        if self._state.adding and self.branch_id and not self.branch.is_active:
            raise ValidationError({"branch": "Branch is not active."})
        if self.medicine_id and self.clinic_id and self.medicine.clinic_id != self.clinic_id:
            raise ValidationError({"medicine": "Medicine is outside this clinic."})
        if self._state.adding and self.medicine_id and not self.medicine.is_active:
            raise ValidationError({"medicine": "Medicine is not active."})
        if self.supplier_id and self.clinic_id and self.supplier.clinic_id != self.clinic_id:
            raise ValidationError({"supplier": "Supplier is outside this clinic."})
        if self.branch_id and self.expiry_date and self._state.adding:
            today = timezone.now().astimezone(ZoneInfo(self.branch.clinic.timezone)).date()
            if self.expiry_date < today:
                raise ValidationError({"expiry_date": "Expiry date cannot be in the past."})
        if self._state.adding and self.quantity_on_hand:
            raise ValidationError({"quantity_on_hand": "Receive stock through a stock transaction."})
        if self.branch_id and self.medicine_id and self.batch_number:
            conflict = MedicineBatch.objects.filter(
                branch_id=self.branch_id,
                medicine_id=self.medicine_id,
                batch_number=self.batch_number.strip(),
            )
            if self.pk:
                conflict = conflict.exclude(pk=self.pk)
            if conflict.exists():
                raise ValidationError({"batch_number": "This batch number already exists for this medicine."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            self.batch_number = (self.batch_number or "").strip()
            if self.branch_id:
                self.clinic_id = self.branch.clinic_id
            previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
            if previous is not None:
                locked = ("medicine_id", "branch_id", "clinic_id", "batch_number", "expiry_date", "supplier_id")
                for field in locked:
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError("Batch identity cannot change.")
                if previous.quantity_on_hand != self.quantity_on_hand and not getattr(self, "_balance_update", False):
                    raise ValidationError("Stock changes must be recorded as transactions.")
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.batch_number


class StockTransactionQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("Stock transactions cannot be changed.")

    def delete(self):
        raise ValidationError("Stock transactions cannot be deleted.")


class StockTransaction(models.Model):
    class Kind(models.TextChoices):
        STOCK_IN = "stock_in", "Stock in"
        ADJUSTMENT = "adjustment", "Adjustment"
        DISPENSE = "dispense", "Dispense"

    class Direction(models.TextChoices):
        IN = "in", "In"
        OUT = "out", "Out"

    class Reason(models.TextChoices):
        DAMAGED = "damaged", "Damaged"
        EXPIRED = "expired", "Expired"
        COUNT_CORRECTION = "count_correction", "Count correction"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="stock_transactions")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="stock_transactions")
    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT, related_name="stock_transactions")
    batch = models.ForeignKey(MedicineBatch, on_delete=models.PROTECT, related_name="transactions")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    direction = models.CharField(max_length=10, choices=Direction.choices)
    quantity = models.PositiveIntegerField()
    reason = models.CharField(max_length=30, choices=Reason.choices, blank=True)
    prescription_item = models.ForeignKey(
        "prescriptions.PrescriptionItem",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="stock_transactions",
    )
    recorded_at = models.DateTimeField(default=timezone.now)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="stock_transactions",
    )

    objects = StockTransactionQuerySet.as_manager()

    class Meta:
        ordering = ["-recorded_at"]
        constraints = [
            models.CheckConstraint(condition=Q(quantity__gte=1), name="stock_txn_quantity_pos"),
        ]
        indexes = [
            models.Index(fields=["branch", "recorded_at"], name="stock_txn_branch_time_idx"),
        ]

    def clean(self):
        if self.quantity is None or self.quantity < 1:
            raise ValidationError({"quantity": "Quantity must be at least 1."})
        if self.kind == self.Kind.STOCK_IN and self.direction != self.Direction.IN:
            raise ValidationError({"direction": "Stock-in increases the batch."})
        if self.kind == self.Kind.DISPENSE and self.direction != self.Direction.OUT:
            raise ValidationError({"direction": "Dispensing decreases the batch."})
        if self.kind == self.Kind.ADJUSTMENT and not self.reason:
            raise ValidationError({"reason": "An adjustment needs a reason."})
        if self.kind == self.Kind.DISPENSE and not self.prescription_item_id:
            raise ValidationError({"prescription_item": "Dispensing needs a prescription item."})
        if self.kind != self.Kind.DISPENSE and self.prescription_item_id:
            raise ValidationError({"prescription_item": "Only a dispense is linked to a prescription."})
        if self.batch_id:
            self.medicine_id = self.batch.medicine_id
            self.branch_id = self.batch.branch_id
            self.clinic_id = self.batch.clinic_id

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Stock transactions cannot be changed.")
        if self.batch_id:
            self.medicine_id = self.batch.medicine_id
            self.branch_id = self.batch.branch_id
            self.clinic_id = self.batch.clinic_id
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Stock transactions cannot be deleted.")

    def __str__(self) -> str:
        return self.kind
