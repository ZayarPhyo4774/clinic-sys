import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone


class AppendOnlyQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Clinical records cannot be deleted.")


class PatientNumberSequence(models.Model):
    clinic = models.OneToOneField(
        "clinics.Clinic",
        on_delete=models.PROTECT,
        related_name="patient_number_sequence",
    )
    last_value = models.PositiveIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.clinic_id}:{self.last_value}"


class Patient(models.Model):
    class Sex(models.TextChoices):
        FEMALE = "female", "Female"
        MALE = "male", "Male"
        OTHER = "other", "Other"
        UNKNOWN = "unknown", "Unknown"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="patients")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="patients")
    patient_number = models.CharField(max_length=20)
    full_name = models.CharField(max_length=255)
    date_of_birth = models.DateField()
    sex = models.CharField(max_length=20, choices=Sex.choices)
    is_active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_patients",
    )

    class Meta:
        ordering = ["patient_number"]
        constraints = [
            models.UniqueConstraint(fields=["clinic", "patient_number"], name="patient_clinic_number_uniq"),
        ]
        indexes = [
            models.Index(fields=["clinic", "full_name"], name="patient_clinic_name_idx"),
            models.Index(fields=["branch", "is_active"], name="patient_branch_active_idx"),
        ]

    def clean(self):
        if self.full_name is not None and not self.full_name.strip():
            raise ValidationError({"full_name": "Name is required."})
        if self.date_of_birth and self.date_of_birth > timezone.localdate():
            raise ValidationError({"date_of_birth": "Date of birth cannot be in the future."})
        if self.branch_id and self.clinic_id and self.branch.clinic_id != self.clinic_id:
            raise ValidationError({"branch": "Branch is outside this clinic."})

    def save(self, *args, **kwargs):
        if self.full_name:
            self.full_name = self.full_name.strip()
        if self.branch_id:
            self.clinic_id = self.branch.clinic_id
        self.full_clean(validate_constraints=False)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Patients cannot be deleted. Deactivate the record instead.")

    def __str__(self) -> str:
        return self.patient_number


class PatientQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Patients cannot be deleted. Deactivate the record instead.")


Patient.add_to_class("objects", PatientQuerySet.as_manager())


class PatientContact(models.Model):
    class Kind(models.TextChoices):
        PHONE = "phone", "Phone"
        EMAIL = "email", "Email"
        EMERGENCY = "emergency", "Emergency"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="contacts")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="patient_contacts")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="patient_contacts")
    kind = models.CharField(max_length=20, choices=Kind.choices)
    name = models.CharField(max_length=255, blank=True)
    value = models.CharField(max_length=255)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_patient_contacts",
    )

    class Meta:
        ordering = ["-is_primary", "kind"]

    def clean(self):
        if not (self.value or "").strip():
            raise ValidationError({"value": "Contact value is required."})
        if self.kind == self.Kind.EMERGENCY and not (self.name or "").strip():
            raise ValidationError({"name": "Emergency contacts require a name."})

    def save(self, *args, **kwargs):
        if self.value:
            self.value = self.value.strip()
        if self.name:
            self.name = self.name.strip()
        self.full_clean()
        return super().save(*args, **kwargs)


class PatientAddress(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="addresses")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="patient_addresses")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="patient_addresses")
    line1 = models.CharField(max_length=255)
    line2 = models.CharField(max_length=255, blank=True)
    city = models.CharField(max_length=120)
    region = models.CharField(max_length=120, blank=True)
    postal_code = models.CharField(max_length=20, blank=True)
    country = models.CharField(max_length=80, blank=True)
    is_primary = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_patient_addresses",
    )

    class Meta:
        ordering = ["-is_primary", "city"]

    def clean(self):
        if not (self.line1 or "").strip():
            raise ValidationError({"line1": "Address line is required."})
        if not (self.city or "").strip():
            raise ValidationError({"city": "City is required."})

    def save(self, *args, **kwargs):
        for field in ("line1", "line2", "city", "region", "postal_code", "country"):
            value = getattr(self, field)
            if value:
                setattr(self, field, value.strip())
        self.full_clean()
        return super().save(*args, **kwargs)


class PatientAllergy(models.Model):
    class Severity(models.TextChoices):
        MILD = "mild", "Mild"
        MODERATE = "moderate", "Moderate"
        SEVERE = "severe", "Severe"
        UNKNOWN = "unknown", "Unknown"

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CORRECTED = "corrected", "Corrected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="allergies")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="patient_allergies")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="patient_allergies")
    substance = models.CharField(max_length=255)
    reaction = models.CharField(max_length=255, blank=True)
    severity = models.CharField(max_length=20, choices=Severity.choices, default=Severity.UNKNOWN)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    supersedes = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="corrections",
    )
    recorded_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_patient_allergies",
    )

    objects = AppendOnlyQuerySet.as_manager()

    class Meta:
        ordering = ["-recorded_at"]

    def clean(self):
        if not (self.substance or "").strip():
            raise ValidationError({"substance": "Substance is required."})
        if self.recorded_at and self.recorded_at > timezone.now():
            raise ValidationError({"recorded_at": "Recorded time cannot be in the future."})
        if self.supersedes_id:
            if self.supersedes.patient_id != self.patient_id:
                raise ValidationError({"supersedes": "Correction must refer to this patient's allergy."})
            if self.supersedes.status != self.Status.ACTIVE:
                raise ValidationError({"supersedes": "Only an active allergy can be corrected."})

    def save(self, *args, **kwargs):
        if self.substance:
            self.substance = self.substance.strip()
        if self.reaction:
            self.reaction = self.reaction.strip()
        if not self._state.adding:
            previous = PatientAllergy.objects.get(pk=self.pk)
            locked = ("patient_id", "substance", "reaction", "severity", "supersedes_id", "clinic_id", "branch_id")
            for field in locked:
                if getattr(previous, field) != getattr(self, field):
                    raise ValidationError("Allergy details cannot be changed. Add a correction.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Clinical records cannot be deleted.")


class PatientMedicalHistory(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CORRECTED = "corrected", "Corrected"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="medical_histories")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="patient_medical_histories")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="patient_medical_histories")
    title = models.CharField(max_length=255)
    details = models.TextField(blank=True)
    onset_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    supersedes = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="corrections",
    )
    recorded_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_patient_histories",
    )

    objects = AppendOnlyQuerySet.as_manager()

    class Meta:
        ordering = ["-recorded_at"]

    def clean(self):
        if not (self.title or "").strip():
            raise ValidationError({"title": "Title is required."})
        if self.onset_date and self.onset_date > timezone.localdate():
            raise ValidationError({"onset_date": "Onset date cannot be in the future."})
        if self.recorded_at and self.recorded_at > timezone.now():
            raise ValidationError({"recorded_at": "Recorded time cannot be in the future."})
        if self.supersedes_id:
            if self.supersedes.patient_id != self.patient_id:
                raise ValidationError({"supersedes": "Correction must refer to this patient's history."})
            if self.supersedes.status != self.Status.ACTIVE:
                raise ValidationError({"supersedes": "Only an active history entry can be corrected."})

    def save(self, *args, **kwargs):
        if self.title:
            self.title = self.title.strip()
        if self.details:
            self.details = self.details.strip()
        if not self._state.adding:
            previous = PatientMedicalHistory.objects.get(pk=self.pk)
            locked = ("patient_id", "title", "details", "onset_date", "supersedes_id", "clinic_id", "branch_id")
            for field in locked:
                if getattr(previous, field) != getattr(self, field):
                    raise ValidationError("Medical history details cannot be changed. Add a correction.")
        self.full_clean()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Clinical records cannot be deleted.")


class PatientDocument(models.Model):
    class DocumentType(models.TextChoices):
        IDENTITY = "identity", "Identity"
        CONSENT = "consent", "Consent"
        REFERRAL = "referral", "Referral"
        OTHER = "other", "Other"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="documents")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="patient_documents")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="patient_documents")
    title = models.CharField(max_length=255)
    document_type = models.CharField(max_length=20, choices=DocumentType.choices, default=DocumentType.OTHER)
    file_name = models.CharField(max_length=255)
    content_type = models.CharField(max_length=120)
    byte_size = models.PositiveIntegerField(null=True, blank=True)
    storage_key = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_patient_documents",
    )

    class Meta:
        ordering = ["-created_at"]

    def clean(self):
        if not (self.title or "").strip():
            raise ValidationError({"title": "Title is required."})
        if not (self.file_name or "").strip():
            raise ValidationError({"file_name": "File name is required."})
        if not (self.storage_key or "").strip():
            raise ValidationError({"storage_key": "Storage key is required."})

    def save(self, *args, **kwargs):
        for field in ("title", "file_name", "content_type", "storage_key"):
            value = getattr(self, field)
            if value:
                setattr(self, field, value.strip())
        self.full_clean()
        return super().save(*args, **kwargs)
