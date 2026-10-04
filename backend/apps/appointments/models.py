import uuid

from django.conf import settings
from django.contrib.postgres.constraints import ExclusionConstraint
from django.contrib.postgres.fields import DateTimeRangeField, RangeOperators
from django.core.exceptions import ValidationError
from django.db import models, transaction
from django.db.models import F, Func, Q
from django.utils import timezone

from apps.appointments.scheduling import (
    dates_overlap,
    duration_minutes,
    fits_schedule,
    times_overlap,
)
from apps.clinics.models import Staff


class TsTzRange(Func):
    function = "TSTZRANGE"
    output_field = DateTimeRangeField()


class DoctorSchedule(models.Model):
    """Weekly availability for one doctor at one branch."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="doctor_schedules")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="doctor_schedules")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="schedules")
    weekday = models.PositiveSmallIntegerField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    slot_minutes = models.PositiveSmallIntegerField()
    effective_from = models.DateField(null=True, blank=True)
    effective_until = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_doctor_schedules",
    )

    class Meta:
        ordering = ["weekday", "start_time"]
        indexes = [
            models.Index(fields=["doctor", "weekday"], name="sched_doctor_weekday_idx"),
            models.Index(fields=["branch", "is_active"], name="sched_branch_active_idx"),
        ]

    def clean(self):
        if self.weekday is None or self.weekday not in range(7):
            raise ValidationError({"weekday": "Use 0 for Monday through 6 for Sunday."})
        if self.slot_minutes is None or self.slot_minutes < 5 or self.slot_minutes > 240:
            raise ValidationError({"slot_minutes": "Use a slot from 5 to 240 minutes."})
        if self.start_time and self.end_time:
            minutes = duration_minutes(self.start_time, self.end_time)
            if minutes <= 0:
                raise ValidationError({"end_time": "End time must be after start time."})
            if minutes % self.slot_minutes != 0:
                raise ValidationError({"slot_minutes": "Slot must divide the schedule window."})
        if self.effective_from and self.effective_until and self.effective_until < self.effective_from:
            raise ValidationError({"effective_until": "End date must be on or after the start date."})
        if self.branch_id and self._state.adding and not self.branch.is_active:
            raise ValidationError({"branch": "Branch is not active."})
        if self.doctor_id and self.branch_id:
            staff = self.doctor.staff
            if staff.staff_type != Staff.StaffType.DOCTOR:
                raise ValidationError({"doctor": "Staff member must be a doctor."})
            if staff.branch_id != self.branch_id:
                raise ValidationError({"doctor": "Doctor is not at this branch."})
            if self.clinic_id and staff.clinic_id != self.clinic_id:
                raise ValidationError({"doctor": "Doctor is outside this clinic."})
            if self._state.adding and not staff.is_active:
                raise ValidationError({"doctor": "Doctor is not active."})
        previous = _previous(self)
        if previous is not None:
            if (
                previous.doctor_id != self.doctor_id
                or previous.branch_id != self.branch_id
                or previous.weekday != self.weekday
            ):
                raise ValidationError({"doctor": "Doctor, branch, and weekday cannot change."})
            window_changed = any(
                getattr(previous, field) != getattr(self, field)
                for field in ("start_time", "end_time", "slot_minutes", "effective_from", "effective_until", "is_active")
            )
            if window_changed and _open_appointments(self.pk):
                raise ValidationError({"start_time": "This schedule still has appointments."})
        if self.doctor_id and self.start_time and self.end_time:
            others = DoctorSchedule.objects.filter(doctor_id=self.doctor_id, weekday=self.weekday, is_active=True)
            if self.pk:
                others = others.exclude(pk=self.pk)
            if self.is_active:
                for other in others:
                    if not dates_overlap(
                        self.effective_from,
                        self.effective_until,
                        other.effective_from,
                        other.effective_until,
                    ):
                        continue
                    if times_overlap(self.start_time, self.end_time, other.start_time, other.end_time):
                        raise ValidationError({"start_time": "This overlaps another schedule."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.doctor_id:
                from apps.clinics.models import DoctorProfile

                DoctorProfile.objects.select_for_update().get(pk=self.doctor_id)
            if self.branch_id:
                self.clinic_id = self.branch.clinic_id
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.doctor_id}:{self.weekday}"


class AppointmentQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Appointments cannot be deleted. Cancel the appointment instead.")


class Appointment(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        CONFIRMED = "confirmed", "Confirmed"
        CHECKED_IN = "checked_in", "Checked in"
        IN_QUEUE = "in_queue", "In queue"
        IN_CONSULTATION = "in_consultation", "In consultation"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"
        NO_SHOW = "no_show", "No show"

    TRANSITIONS = {
        Status.SCHEDULED: {Status.CONFIRMED, Status.CHECKED_IN, Status.CANCELLED, Status.NO_SHOW},
        Status.CONFIRMED: {Status.CHECKED_IN, Status.CANCELLED, Status.NO_SHOW},
        Status.CHECKED_IN: {Status.IN_QUEUE, Status.CANCELLED},
        Status.IN_QUEUE: {Status.IN_CONSULTATION, Status.CANCELLED},
        Status.IN_CONSULTATION: {Status.COMPLETED},
        Status.COMPLETED: set(),
        Status.CANCELLED: set(),
        Status.NO_SHOW: set(),
    }
    RESCHEDULABLE = {Status.SCHEDULED, Status.CONFIRMED}
    TERMINAL = {Status.COMPLETED, Status.CANCELLED, Status.NO_SHOW}
    BLOCKING = {
        Status.SCHEDULED,
        Status.CONFIRMED,
        Status.CHECKED_IN,
        Status.IN_QUEUE,
        Status.IN_CONSULTATION,
        Status.COMPLETED,
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="appointments")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="appointments")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="appointments")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="appointments")
    schedule = models.ForeignKey(DoctorSchedule, on_delete=models.PROTECT, related_name="appointments")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.SCHEDULED)
    visit_reason = models.CharField(max_length=120, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_appointments",
    )

    objects = AppointmentQuerySet.as_manager()

    class Meta:
        ordering = ["starts_at"]
        constraints = [
            models.CheckConstraint(
                condition=Q(ends_at__gt=F("starts_at")),
                name="appointment_end_after_start",
            ),
            ExclusionConstraint(
                name="appt_doctor_overlap_excl",
                expressions=[
                    (TsTzRange("starts_at", "ends_at"), RangeOperators.OVERLAPS),
                    ("doctor", RangeOperators.EQUAL),
                ],
                condition=Q(status__in=["scheduled", "confirmed", "checked_in", "in_queue", "in_consultation", "completed"]),
            ),
            ExclusionConstraint(
                name="appt_patient_overlap_excl",
                expressions=[
                    (TsTzRange("starts_at", "ends_at"), RangeOperators.OVERLAPS),
                    ("patient", RangeOperators.EQUAL),
                ],
                condition=Q(status__in=["scheduled", "confirmed", "checked_in", "in_queue", "in_consultation", "completed"]),
            ),
        ]
        indexes = [
            models.Index(fields=["branch", "starts_at"], name="appt_branch_start_idx"),
            models.Index(fields=["doctor", "starts_at"], name="appt_doctor_start_idx"),
            models.Index(fields=["patient", "starts_at"], name="appt_patient_start_idx"),
        ]

    def clean(self):
        previous = _previous(self)
        if self.visit_reason:
            self.visit_reason = self.visit_reason.strip()
        if self._state.adding and self.status != self.Status.SCHEDULED:
            raise ValidationError({"status": "New appointments start as scheduled."})
        if self.branch_id:
            self.clinic_id = self.branch.clinic_id
        if self.branch_id and self._state.adding and not self.branch.is_active:
            raise ValidationError({"branch": "Branch is not active."})
        if self.patient_id and self.clinic_id and self.patient.clinic_id != self.clinic_id:
            raise ValidationError({"patient": "Patient is outside this clinic."})
        if self.doctor_id and self.branch_id and self.doctor.staff.branch_id != self.branch_id:
            raise ValidationError({"doctor": "Doctor is not at this branch."})
        if self.doctor_id and self.clinic_id and self.doctor.staff.clinic_id != self.clinic_id:
            raise ValidationError({"doctor": "Doctor is outside this clinic."})
        if previous is not None:
            if previous.patient_id != self.patient_id:
                raise ValidationError({"patient": "Patient cannot change."})
            if previous.doctor_id != self.doctor_id:
                raise ValidationError({"doctor": "Doctor cannot change."})
            if previous.branch_id != self.branch_id:
                raise ValidationError({"branch": "Branch cannot change."})
            if previous.visit_reason != self.visit_reason:
                raise ValidationError({"visit_reason": "Visit reason cannot change."})
            if self.status != previous.status and self.status not in self.TRANSITIONS[previous.status]:
                raise ValidationError({"status": "This status change is not allowed."})
            times_changed = (
                previous.starts_at != self.starts_at
                or previous.ends_at != self.ends_at
                or previous.schedule_id != self.schedule_id
            )
            if times_changed and (
                previous.status not in self.RESCHEDULABLE or self.status != previous.status
            ):
                raise ValidationError({"starts_at": "This appointment can no longer be rescheduled."})
        moving_to_checked_in = self.status == self.Status.CHECKED_IN and (
            previous is None or previous.status != self.Status.CHECKED_IN
        )
        if self.patient_id and not self.patient.is_active and (self._state.adding or moving_to_checked_in):
            raise ValidationError({"patient": "Patient is not active."})
        times_need_schedule = self._state.adding or (
            previous is not None
            and (
                previous.starts_at != self.starts_at
                or previous.ends_at != self.ends_at
                or previous.schedule_id != self.schedule_id
            )
        )
        if times_need_schedule:
            if self.doctor_id and not self.doctor.staff.is_active:
                raise ValidationError({"doctor": "Doctor is not active."})
            if self.starts_at and self.starts_at <= timezone.now():
                raise ValidationError({"starts_at": "Appointment must be in the future."})
            self._require_open_slot(previous)
        if self.status == self.Status.IN_QUEUE and self.pk:
            from apps.queues.models import QueueEntry

            if not QueueEntry.objects.filter(appointment_id=self.pk).exists():
                raise ValidationError({"status": "This status change is not allowed."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            previous_status = None if self._state.adding else type(self).objects.get(pk=self.pk).status
            if self.branch_id:
                self.clinic_id = self.branch.clinic_id
            if self.visit_reason:
                self.visit_reason = self.visit_reason.strip()
            self.full_clean(validate_constraints=False)
            saved = super().save(*args, **kwargs)
            if previous_status != self.status and self.status == self.Status.CANCELLED:
                self._cancel_queue()
            return saved

    def delete(self, *args, **kwargs):
        raise ValidationError("Appointments cannot be deleted. Cancel the appointment instead.")

    def _require_open_slot(self, previous):
        if not self.schedule_id or not self.starts_at or not self.ends_at or not self.branch_id:
            raise ValidationError({"starts_at": "Outside the doctor's schedule."})
        if self.schedule.doctor_id != self.doctor_id or self.schedule.branch_id != self.branch_id:
            raise ValidationError({"schedule": "Schedule does not match this doctor and branch."})
        if not fits_schedule(self.schedule, self.starts_at, self.ends_at, self.branch.clinic.timezone):
            raise ValidationError({"starts_at": "Outside the doctor's schedule."})
        if self.ends_at <= self.starts_at:
            raise ValidationError({"ends_at": "End time must be after start time."})
        doctor_clash = Appointment.objects.filter(
            doctor_id=self.doctor_id,
            starts_at__lt=self.ends_at,
            ends_at__gt=self.starts_at,
            status__in=self.BLOCKING,
        )
        patient_clash = Appointment.objects.filter(
            patient_id=self.patient_id,
            starts_at__lt=self.ends_at,
            ends_at__gt=self.starts_at,
            status__in=self.BLOCKING,
        )
        if previous is not None:
            doctor_clash = doctor_clash.exclude(pk=self.pk)
            patient_clash = patient_clash.exclude(pk=self.pk)
        if doctor_clash.exists() or patient_clash.exists():
            raise ValidationError({"starts_at": "This time is no longer available."})

    def _cancel_queue(self):
        from apps.queues.models import QueueEntry

        try:
            entry = QueueEntry.objects.select_for_update().get(appointment_id=self.pk)
        except QueueEntry.DoesNotExist:
            return
        if entry.status == QueueEntry.Status.CANCELLED:
            return
        if QueueEntry.Status.CANCELLED not in QueueEntry.TRANSITIONS[entry.status]:
            raise ValidationError({"status": "This status change is not allowed."})
        entry.status = QueueEntry.Status.CANCELLED
        entry.save(update_fields=["status", "updated_at"])

    def __str__(self) -> str:
        return self.status


def _previous(instance):
    if instance._state.adding or not instance.pk:
        return None
    return type(instance).objects.get(pk=instance.pk)


def _open_appointments(schedule_id) -> bool:
    return Appointment.objects.filter(schedule_id=schedule_id).exclude(status__in=Appointment.TERMINAL).exists()
