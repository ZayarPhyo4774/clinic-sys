import uuid

from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models


class SyncOperation(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        SYNCED = "synced", "Synced"
        FAILED = "failed", "Failed"
        CONFLICT = "conflict", "Conflict"

    class Operation(models.TextChoices):
        CREATE = "create", "Create"
        UPDATE = "update", "Update"
        CANCEL = "cancel", "Cancel"
        CORRECT = "correct", "Correct"

    operation_id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    device_id = models.CharField(max_length=64)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sync_operations")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="sync_operations")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="sync_operations")
    entity_type = models.CharField(max_length=100)
    entity_id = models.UUIDField(null=True, blank=True)
    operation = models.CharField(max_length=20, choices=Operation.choices)
    payload = models.JSONField()
    payload_hash = models.CharField(max_length=64)
    created_at = models.DateTimeField()
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    retry_count = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True, default="")
    server_entity_id = models.UUIDField(null=True, blank=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    received_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["received_at"]
        indexes = [
            models.Index(fields=["user", "device_id", "status"], name="sync_op_user_device_idx"),
            models.Index(fields=["clinic", "branch", "status"], name="sync_op_scope_idx"),
        ]

    def save(self, *args, **kwargs):
        if not self._state.adding:
            previous = type(self).objects.get(pk=self.operation_id)
            if previous.status == self.Status.SYNCED:
                raise ValidationError("An acknowledged operation cannot be changed.")
            if previous.status == self.Status.CONFLICT and self.status != self.Status.CONFLICT:
                raise ValidationError("A conflict cannot be applied again.")
            if previous.payload_hash != self.payload_hash and previous.status not in {
                self.Status.PENDING,
                self.Status.FAILED,
            }:
                raise ValidationError("The operation payload cannot change.")
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise ValidationError("Synchronization operations cannot be deleted.")

    def __str__(self) -> str:
        return f"{self.operation_id}:{self.status}"


class SyncChange(models.Model):
    operation = models.ForeignKey(SyncOperation, on_delete=models.PROTECT, related_name="changes")
    clinic = models.ForeignKey("clinics.Clinic", on_delete=models.PROTECT, related_name="sync_changes")
    branch = models.ForeignKey("clinics.Branch", on_delete=models.PROTECT, related_name="sync_changes")
    device_id = models.CharField(max_length=64)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="sync_changes")
    entity_type = models.CharField(max_length=100)
    entity_id = models.UUIDField(null=True, blank=True)
    operation_name = models.CharField(max_length=20)
    payload = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]
        indexes = [
            models.Index(fields=["clinic", "id"], name="sync_change_clinic_idx"),
        ]

    def delete(self, *args, **kwargs):
        raise ValidationError("Synchronization changes cannot be deleted.")

    def __str__(self) -> str:
        return f"{self.id}:{self.entity_type}"
