from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from apps.synchronization.models import SyncOperation


class SyncOperationInputSerializer(serializers.Serializer):
    operation_id = serializers.UUIDField()
    device_id = serializers.CharField(max_length=64)
    user_id = serializers.UUIDField()
    clinic_id = serializers.UUIDField()
    branch_id = serializers.UUIDField()
    entity_type = serializers.CharField(max_length=100)
    entity_id = serializers.UUIDField(allow_null=True, required=False)
    operation = serializers.ChoiceField(choices=SyncOperation.Operation.choices)
    payload = serializers.JSONField()
    created_at = serializers.DateTimeField()
    status = serializers.CharField(required=False, allow_blank=True)
    retry_count = serializers.IntegerField(required=False, min_value=0)
    last_error = serializers.CharField(required=False, allow_blank=True)

    def validate_device_id(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Device is required.")
        return cleaned

    def validate_entity_type(self, value):
        cleaned = value.strip()
        if not cleaned:
            raise serializers.ValidationError("Entity type is required.")
        return cleaned

    def validate_payload(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Payload must be an object.")
        return value

    def validate_created_at(self, value):
        if value > timezone.now() + timedelta(minutes=5):
            raise serializers.ValidationError("created_at cannot be in the future.")
        return value


class SyncPushSerializer(serializers.Serializer):
    operations = SyncOperationInputSerializer(many=True, allow_empty=False)

    def validate_operations(self, value):
        if len(value) > 50:
            raise serializers.ValidationError("Send at most 50 operations.")
        return value
