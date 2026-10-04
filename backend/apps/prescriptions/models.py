import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction

from apps.encounters.models import Encounter


class PrescriptionQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Prescriptions cannot be deleted.")


class Prescription(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        PARTIALLY_DISPENSED = "partially_dispensed", "Partially dispensed"
        DISPENSED = "dispensed", "Dispensed"
        CANCELLED = "cancelled", "Cancelled"

    TRANSITIONS = {
        Status.ACTIVE: {Status.PARTIALLY_DISPENSED, Status.DISPENSED, Status.CANCELLED},
        Status.PARTIALLY_DISPENSED: {Status.DISPENSED},
        Status.DISPENSED: set(),
        Status.CANCELLED: set(),
    }
    OPENABLE = {Status.ACTIVE, Status.PARTIALLY_DISPENSED}

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    encounter = models.ForeignKey(Encounter, on_delete=models.PROTECT, related_name="prescriptions")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="prescriptions")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="prescriptions")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="prescriptions")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="prescriptions")
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.ACTIVE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_prescriptions",
    )

    objects = PrescriptionQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["patient", "created_at"], name="rx_patient_created_idx"),
            models.Index(fields=["branch", "status"], name="rx_branch_status_idx"),
        ]

    def clean(self):
        if self._state.adding:
            if self.status != self.Status.ACTIVE:
                raise ValidationError({"status": "New prescriptions start active."})
            if self.encounter_id and self.encounter.status != Encounter.Status.OPEN:
                raise ValidationError({"encounter": "The encounter is not open."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.encounter_id:
                encounter = Encounter.objects.select_for_update().get(pk=self.encounter_id)
                self.patient_id = encounter.patient_id
                self.doctor_id = encounter.doctor_id
                self.branch_id = encounter.branch_id
                self.clinic_id = encounter.clinic_id
                self.encounter = encounter
            previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
            if previous is not None:
                for field in ("encounter_id", "patient_id", "doctor_id", "branch_id", "clinic_id"):
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError("Prescription attribution cannot change.")
                if self.status != previous.status and self.status not in self.TRANSITIONS[previous.status]:
                    raise ValidationError({"status": "This status change is not allowed."})
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Prescriptions cannot be deleted.")

    def __str__(self) -> str:
        return self.status


class PrescriptionItemQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Prescription items cannot be deleted.")


class PrescriptionItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    prescription = models.ForeignKey(Prescription, on_delete=models.PROTECT, related_name="items")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="prescription_items")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="prescription_items")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="prescription_items")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="prescription_items")
    medicine = models.ForeignKey("pharmacy.Medicine", on_delete=models.PROTECT, related_name="prescription_items")
    quantity = models.PositiveIntegerField()
    quantity_dispensed = models.PositiveIntegerField(default=0)
    dosage = models.CharField(max_length=255)
    frequency = models.CharField(max_length=120, blank=True)
    duration_days = models.PositiveSmallIntegerField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_prescription_items",
    )

    objects = PrescriptionItemQuerySet.as_manager()

    class Meta:
        ordering = ["created_at"]
        constraints = [
            models.CheckConstraint(condition=models.Q(quantity__gte=1), name="rx_item_quantity_pos"),
            models.CheckConstraint(
                condition=models.Q(quantity_dispensed__lte=models.F("quantity")),
                name="rx_item_dispensed_lte",
            ),
        ]

    def clean(self):
        if self.quantity is None or self.quantity < 1:
            raise ValidationError({"quantity": "Quantity must be at least 1."})
        if self.quantity_dispensed is None or self.quantity_dispensed < 0:
            raise ValidationError({"quantity_dispensed": "Dispensed quantity cannot be negative."})
        if self.quantity_dispensed > self.quantity:
            raise ValidationError({"quantity": "Dispensed quantity cannot exceed the prescription."})
        if not (self.dosage or "").strip():
            raise ValidationError({"dosage": "Dosage is required."})
        if self.medicine_id and self.clinic_id and self.medicine.clinic_id != self.clinic_id:
            raise ValidationError({"medicine": "Medicine is outside this clinic."})
        if self._state.adding and self.medicine_id and not self.medicine.is_active:
            raise ValidationError({"medicine": "Medicine is not active."})
        if self._state.adding and self.prescription_id and self.prescription.status not in Prescription.OPENABLE:
            raise ValidationError({"prescription": "Items cannot be added to this prescription."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            self.dosage = (self.dosage or "").strip()
            self.frequency = (self.frequency or "").strip()
            if self.prescription_id:
                prescription = self.prescription
                self.patient_id = prescription.patient_id
                self.doctor_id = prescription.doctor_id
                self.branch_id = prescription.branch_id
                self.clinic_id = prescription.clinic_id
            previous = None if self._state.adding or not self.pk else type(self).objects.get(pk=self.pk)
            if previous is not None:
                locked = (
                    "prescription_id",
                    "medicine_id",
                    "quantity",
                    "dosage",
                    "frequency",
                    "duration_days",
                    "patient_id",
                    "doctor_id",
                    "branch_id",
                    "clinic_id",
                )
                for field in locked:
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError("Prescription item details cannot be changed.")
                if previous.quantity_dispensed != self.quantity_dispensed and not getattr(self, "_dispense_update", False):
                    raise ValidationError("Dispensed quantity changes only through dispensing.")
                if self.quantity_dispensed < previous.quantity_dispensed:
                    raise ValidationError("Dispensed quantity cannot decrease.")
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Prescription items cannot be deleted.")

    def __str__(self) -> str:
        return str(self.quantity)
