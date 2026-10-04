from rest_framework import serializers

from apps.clinics.serializer_mixins import DoctorFullNameMixin
from apps.queues.models import QueueEntry


class QueueEntrySerializer(DoctorFullNameMixin, serializers.ModelSerializer):
    appointment_status = serializers.CharField(source="appointment.status", read_only=True)

    class Meta:
        model = QueueEntry
        fields = [
            "id",
            "appointment",
            "appointment_status",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "doctor_full_name",
            "service_date",
            "position",
            "status",
            "called_at",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = fields
