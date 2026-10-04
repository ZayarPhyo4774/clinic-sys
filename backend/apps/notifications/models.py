import uuid

from django.db import models


class Notification(models.Model):
    class Kind(models.TextChoices):
        INFO = "info", "Info"
        ALERT = "alert", "Alert"
        ASSIGNMENT = "assignment", "Assignment"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="notifications")
    branch = models.ForeignKey(
        "clinics.Branch",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="notifications",
    )
    recipient = models.ForeignKey(
        "accounts.User",
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    title = models.CharField(max_length=200)
    message = models.TextField(blank=True)
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.INFO)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "read_at"], name="notif_recipient_read_idx"),
            models.Index(fields=["clinic", "created_at"], name="notif_clinic_created_idx"),
        ]
