import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models, transaction

from apps.appointments.models import Appointment
from apps.appointments.scheduling import local_bounds


class QueueEntryQuerySet(models.QuerySet):
    def delete(self):
        raise ValidationError("Queue entries cannot be deleted.")


class QueueEntry(models.Model):
    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        CALLED = "called", "Called"
        IN_SERVICE = "in_service", "In service"
        COMPLETED = "completed", "Completed"
        SKIPPED = "skipped", "Skipped"
        CANCELLED = "cancelled", "Cancelled"

    TRANSITIONS = {
        Status.WAITING: {Status.CALLED, Status.SKIPPED, Status.CANCELLED},
        Status.CALLED: {Status.IN_SERVICE, Status.SKIPPED, Status.CANCELLED},
        Status.IN_SERVICE: {Status.COMPLETED},
        Status.COMPLETED: set(),
        Status.SKIPPED: {Status.WAITING},
        Status.CANCELLED: set(),
    }

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    appointment = models.OneToOneField(Appointment, on_delete=models.PROTECT, related_name="queue_entry")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="queue_entries")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="queue_entries")
    patient = models.ForeignKey("patients.Patient", on_delete=models.PROTECT, related_name="queue_entries")
    doctor = models.ForeignKey("clinics.DoctorProfile", on_delete=models.PROTECT, related_name="queue_entries")
    service_date = models.DateField()
    position = models.PositiveIntegerField()
    status = models.CharField(max_length=32, choices=Status.choices, default=Status.WAITING)
    called_at = models.DateTimeField(null=True, blank=True)
    triage_started_at = models.DateTimeField(null=True, blank=True)
    vitals_recorded_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_queue_entries",
    )

    objects = QueueEntryQuerySet.as_manager()

    class Meta:
        ordering = ["service_date", "position"]
        constraints = [
            models.UniqueConstraint(
                fields=["branch", "doctor", "service_date", "position"],
                name="queue_position_uniq",
            ),
        ]
        indexes = [
            models.Index(fields=["branch", "service_date", "status"], name="queue_branch_day_idx"),
        ]

    def clean(self):
        if self.position is None or self.position < 1:
            raise ValidationError({"position": "Queue position must be at least 1."})
        if not self.appointment_id:
            raise ValidationError({"appointment": "Appointment is required."})
        appointment = Appointment.objects.get(pk=self.appointment_id)
        if self._state.adding:
            if self.status != self.Status.WAITING:
                raise ValidationError({"status": "New queue entries start as waiting."})
            if appointment.status != Appointment.Status.CHECKED_IN:
                raise ValidationError({"appointment": "Check the patient in before queueing."})
        else:
            previous = type(self).objects.get(pk=self.pk)
            if previous.appointment_id != self.appointment_id:
                raise ValidationError({"appointment": "Appointment cannot change."})
            for field in ("patient_id", "doctor_id", "branch_id", "clinic_id", "service_date"):
                if getattr(previous, field) != getattr(self, field):
                    raise ValidationError({"status": "This status change is not allowed."})
            if self.position != previous.position and not (
                previous.status == self.Status.SKIPPED and self.status == self.Status.WAITING
            ):
                raise ValidationError({"position": "Queue position cannot change."})
            if self.status != previous.status and self.status not in self.TRANSITIONS[previous.status]:
                raise ValidationError({"status": "This status change is not allowed."})
            if self.status == self.Status.IN_SERVICE and appointment.status != Appointment.Status.IN_CONSULTATION:
                raise ValidationError({"status": "This status change is not allowed."})
            if self.status == self.Status.COMPLETED and appointment.status != Appointment.Status.COMPLETED:
                raise ValidationError({"status": "This status change is not allowed."})
            if self.status == self.Status.CANCELLED and appointment.status != Appointment.Status.CANCELLED:
                raise ValidationError({"status": "This status change is not allowed."})
            if self.status == self.Status.CALLED and appointment.status != Appointment.Status.IN_QUEUE:
                raise ValidationError({"status": "This status change is not allowed."})

    def save(self, *args, **kwargs):
        with transaction.atomic():
            if self.appointment_id:
                appointment = Appointment.objects.get(pk=self.appointment_id)
                self.patient_id = appointment.patient_id
                self.doctor_id = appointment.doctor_id
                self.branch_id = appointment.branch_id
                self.clinic_id = appointment.clinic_id
                if self._state.adding:
                    start, _end = local_bounds(
                        appointment.starts_at,
                        appointment.ends_at,
                        appointment.branch.clinic.timezone,
                    )
                    self.service_date = start.date()
            self.full_clean(validate_constraints=False)
            return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Queue entries cannot be deleted.")

    def __str__(self) -> str:
        return f"{self.service_date}:{self.position}"
