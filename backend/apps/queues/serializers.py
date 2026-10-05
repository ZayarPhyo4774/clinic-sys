from rest_framework import serializers

from apps.clinics.serializer_mixins import DoctorFullNameMixin
from apps.queues.models import QueueEntry


class QueueEntrySerializer(DoctorFullNameMixin, serializers.ModelSerializer):
    appointment_status = serializers.CharField(source="appointment.status", read_only=True)
    encounter = serializers.SerializerMethodField()

    class Meta:
        model = QueueEntry
        fields = [
            "id",
            "appointment",
            "appointment_status",
            "encounter",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "doctor_full_name",
            "service_date",
            "position",
            "status",
            "called_at",
            "triage_started_at",
            "vitals_recorded_at",
            "started_at",
            "completed_at",
            "created_at",
            "updated_at",
            "created_by",
        ]

    def get_encounter(self, obj):
        encounter = getattr(obj.appointment, "encounter", None)
        if encounter is None:
            return None
        return str(encounter.id)
        read_only_fields = fields
