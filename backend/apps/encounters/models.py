import uuid
from zoneinfo import ZoneInfo

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.utils import timezone

from apps.appointments.models import Appointment


class AppendOnlyQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Clinical records cannot be deleted.")


class EncounterQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Encounters cannot be deleted.")


class Encounter(models.Model):
    class Status(models.TextChoices):
        OPEN = "open", "Open"
        COMPLETED = "completed", "Completed"

    class Phase(models.TextChoices):
        TRIAGE = "triage", "Triage"
        CONSULTATION = "consultation", "Consultation"

    TRANSITIONS = {
        Status.OPEN: {Status.COMPLETED},
        Status.COMPLETED: set(),
    }

    PHASE_TRANSITIONS = {
        Phase.TRIAGE: {Phase.CONSULTATION},
        Phase.CONSULTATION: set(),
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.OneToOneField(Appointment, on_delete=models.PROTECT, related_name="encounter")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="encounters")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="encounters")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="encounters")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="encounters")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.OPEN)
    phase = models.CharField(max_length=20, choices=Phase.choices, default=Phase.CONSULTATION)
    started_at = models.DateTimeField(default=timezone.now)
    started_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="started_encounters",
    )
    completed_at = models.DateTimeField(null=True, blank=True)
    completed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="completed_encounters",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = EncounterQuerySet.as_manager()

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["patient", "started_at"], name="enc_patient_started_idx"),
            models.Index(fields=["branch", "status"], name="enc_branch_status_idx"),
        ]

    def clean(self):
        if not self.appointment_id:
            raise ValidationError({"appointment": "Appointment is required."})
        if not self.started_by_id:
            raise ValidationError({"started_by": "A user is required."})
        if self._state.adding:
            if self.status != self.Status.OPEN:
                raise ValidationError({"status": "New encounters start open."})
            appointment = Appointment.objects.get(pk=self.appointment_id)
            if self.phase == self.Phase.TRIAGE:
                if appointment.status != Appointment.Status.IN_QUEUE:
                    raise ValidationError({"appointment": "The patient must be in the queue before triage."})
            elif appointment.status != Appointment.Status.IN_CONSULTATION:
                raise ValidationError({"appointment": "Start the consultation before the encounter."})
        if self.started_at and self.started_at > timezone.now():
            raise ValidationError({"started_at": "Start time cannot be in the future."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.appointment_id:
                appointment = Appointment.objects.select_for_update().get(pk=self.appointment_id)
                self.patient_id = appointment.patient_id
                self.doctor_id = appointment.doctor_id
                self.branch_id = appointment.branch_id
                self.clinic_id = appointment.clinic_id
            if not self.started_at:
                self.started_at = timezone.now()
            previous = None if self._state.adding else type(self).objects.get(pk=self.pk)
            if previous is not None:
                for field in ("appointment_id", "patient_id", "doctor_id", "branch_id", "clinic_id", "started_at", "started_by_id"):
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError("Encounter attribution cannot change.")
                if previous.phase != self.phase and self.phase not in self.PHASE_TRANSITIONS[previous.phase]:
                    raise ValidationError({"phase": "Encounter phase cannot change."})
                if self.status != previous.status and self.status not in self.TRANSITIONS[previous.status]:
                    raise ValidationError({"status": "This status change is not allowed."})
                if previous.status != self.status and self.status == self.Status.COMPLETED:
                    if not self.completed_by_id:
                        raise ValidationError({"completed_by": "A user is required."})
                    if not self.completed_at:
                        self.completed_at = timezone.now()
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Encounters cannot be deleted.")

    def __str__(self) -> str:
        return self.status


class EncounterConsultationMeta(models.Model):
    class PatientStatus(models.TextChoices):
        NEW = "new", "New"
        OLD = "old", "Old"

    encounter = models.OneToOneField(Encounter, on_delete=models.CASCADE, related_name="consultation_meta")
    patient_status = models.CharField(max_length=10, choices=PatientStatus.choices, blank=True)
    is_plw = models.BooleanField(default=False)
    is_disabled = models.BooleanField(default=False)
    disability_type = models.ForeignKey(
        "clinics.ClinicDisabilityType",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="consultation_entries",
    )
    referral_made = models.BooleanField(default=False)
    referral_cause = models.TextField(blank=True)
    treatment = models.TextField(blank=True)
    remark = models.TextField(blank=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_consultation_meta",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def clean(self):
        if self.is_disabled and self.disability_type_id is None:
            raise ValidationError({"disability_type": "Select a disability type when disability is marked."})
        if self.disability_type_id and not self.is_disabled:
            raise ValidationError({"is_disabled": "Enable disability before selecting a type."})
        if self.disability_type_id and self.disability_type.clinic_id != self.encounter.clinic_id:
            raise ValidationError({"disability_type": "Disability type must belong to this clinic."})
        if self.referral_made and not (self.referral_cause or "").strip():
            pass
        self.referral_cause = (self.referral_cause or "").strip()
        self.treatment = (self.treatment or "").strip()
        self.remark = (self.remark or "").strip()

    def save(self, *args, **kwargs):
        self.full_clean()
        return super().save(*args, **kwargs)


class ClinicalFact(models.Model):
    """Append-only clinical row. Corrections are new rows; values do not change."""

    class Status(models.TextChoices):
        ACTIVE = "active", "Active"
        CORRECTED = "corrected", "Corrected"

    content_fields = ()

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    encounter = models.ForeignKey(Encounter, on_delete=models.PROTECT, related_name="%(class)s_entries")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="%(class)s_entries")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="%(class)s_entries")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="%(class)s_entries")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="%(class)s_entries")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    supersedes = models.ForeignKey(
        "self",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="%(class)s_corrections",
    )
    recorded_at = models.DateTimeField(default=timezone.now)
    recorded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="%(class)s_entries",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = AppendOnlyQuerySet.as_manager()

    class Meta:
        abstract = True
        ordering = ["-recorded_at"]

    def validate_content(self):
        return None

    def clean(self):
        if not self.recorded_by_id:
            raise ValidationError({"recorded_by": "A user is required."})
        if self.recorded_at and self.recorded_at > timezone.now():
            raise ValidationError({"recorded_at": "Recorded time cannot be in the future."})
        if self._state.adding and not self.supersedes_id and self.encounter.status != Encounter.Status.OPEN:
            raise ValidationError({"encounter": "This encounter is complete."})
        if self.supersedes_id:
            if self.supersedes.encounter_id != self.encounter_id:
                raise ValidationError({"supersedes": "Correction must refer to this encounter."})
            if self.supersedes.status != self.Status.ACTIVE:
                raise ValidationError({"supersedes": "Only an active record can be corrected."})
        self.validate_content()

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.encounter_id:
                encounter = Encounter.objects.select_for_update().get(pk=self.encounter_id)
                self.patient_id = encounter.patient_id
                self.doctor_id = encounter.doctor_id
                self.branch_id = encounter.branch_id
                self.clinic_id = encounter.clinic_id
                self.encounter = encounter
            if not self._state.adding:
                previous = type(self).objects.get(pk=self.pk)
                locked = (
                    "encounter_id",
                    "clinic_id",
                    "branch_id",
                    "patient_id",
                    "doctor_id",
                    "supersedes_id",
                    "recorded_by_id",
                    "recorded_at",
                    *self.content_fields,
                )
                for field in locked:
                    if getattr(previous, field) != getattr(self, field):
                        raise ValidationError("Clinical details cannot be changed. Add a correction.")
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Clinical records cannot be deleted.")


class VitalSign(ClinicalFact):
    content_fields = (
        "temperature",
        "pulse",
        "respiratory_rate",
        "systolic",
        "diastolic",
        "spo2",
        "weight_kg",
        "height_cm",
    )

    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    pulse = models.PositiveSmallIntegerField(null=True, blank=True)
    respiratory_rate = models.PositiveSmallIntegerField(null=True, blank=True)
    systolic = models.PositiveSmallIntegerField(null=True, blank=True)
    diastolic = models.PositiveSmallIntegerField(null=True, blank=True)
    spo2 = models.PositiveSmallIntegerField(null=True, blank=True)
    weight_kg = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    height_cm = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)

    def validate_content(self):
        values = [getattr(self, field) for field in self.content_fields]
        if all(value is None for value in values):
            raise ValidationError({"temperature": "Record at least one measurement."})
        if (self.systolic is None) != (self.diastolic is None):
            raise ValidationError({"systolic": "Record both blood pressure numbers."})
        if self.systolic is not None and self.diastolic is not None and self.systolic <= self.diastolic:
            raise ValidationError({"systolic": "Systolic pressure must be higher than diastolic."})
        checks = (
            ("temperature", self.temperature, 30, 45),
            ("pulse", self.pulse, 20, 250),
            ("respiratory_rate", self.respiratory_rate, 5, 80),
            ("systolic", self.systolic, 50, 250),
            ("diastolic", self.diastolic, 30, 150),
            ("spo2", self.spo2, 50, 100),
            ("weight_kg", self.weight_kg, 0.2, 500),
            ("height_cm", self.height_cm, 30, 250),
        )
        for field, value, low, high in checks:
            if value is not None and (value < low or value > high):
                raise ValidationError({field: "Value is outside the accepted range."})


class Symptom(ClinicalFact):
    content_fields = ("description",)
    description = models.TextField()

    def validate_content(self):
        self.description = (self.description or "").strip()
        if not self.description:
            raise ValidationError({"description": "Description is required."})


class Diagnosis(ClinicalFact):
    content_fields = ("code", "description")
    code = models.CharField(max_length=20, blank=True)
    description = models.TextField()

    def validate_content(self):
        self.code = (self.code or "").strip().upper()
        self.description = (self.description or "").strip()
        if not self.description:
            raise ValidationError({"description": "Description is required."})


class ClinicalNote(ClinicalFact):
    content_fields = ("body",)
    body = models.TextField()

    def validate_content(self):
        self.body = (self.body or "").strip()
        if not self.body:
            raise ValidationError({"body": "Note is required."})


class TreatmentPlan(ClinicalFact):
    content_fields = ("title", "details")
    title = models.CharField(max_length=255)
    details = models.TextField(blank=True)

    def validate_content(self):
        self.title = (self.title or "").strip()
        self.details = (self.details or "").strip()
        if not self.title:
            raise ValidationError({"title": "Title is required."})


class FollowUp(ClinicalFact):
    content_fields = ("follow_up_on", "note")
    follow_up_on = models.DateField()
    note = models.CharField(max_length=255, blank=True)

    def validate_content(self):
        self.note = (self.note or "").strip()
        if not self.follow_up_on:
            raise ValidationError({"follow_up_on": "Follow-up date is required."})
        zone = ZoneInfo(self.clinic.timezone)
        today = timezone.now().astimezone(zone).date()
        if self.follow_up_on < today:
            raise ValidationError({"follow_up_on": "Follow-up date cannot be in the past."})
