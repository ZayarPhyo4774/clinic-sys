import uuid

from django.core.exceptions import ValidationError
from django.db import models

from apps.audit.sanitization import sanitize_metadata


class AuditEventQuerySet(models.QuerySet):
    def update(self, **kwargs):
        raise ValidationError("Audit events cannot be updated.")

    def delete(self):
        raise ValidationError("Audit events cannot be deleted.")


class AuditEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        "accounts.User",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_events",
    )
    action = models.CharField(max_length=100)
    entity_type = models.CharField(max_length=100)
    entity_id = models.UUIDField(null=True, blank=True)
    clinic = models.ForeignKey(
        "clinics.Clinic",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_events",
    )
    branch = models.ForeignKey(
        "clinics.Branch",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="audit_events",
    )
    device_id = models.CharField(max_length=64, blank=True, default="")
    metadata = models.JSONField(default=dict)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = AuditEventQuerySet.as_manager()

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["created_at"], name="audit_event_created_idx"),
            models.Index(fields=["entity_type", "entity_id"], name="audit_event_entity_idx"),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            raise ValidationError("Audit events cannot be updated.")
        self.metadata = sanitize_metadata(self.metadata)
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Audit events cannot be deleted.")

    def __str__(self) -> str:
        return f"{self.action}:{self.entity_type}"
