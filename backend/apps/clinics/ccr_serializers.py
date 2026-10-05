from rest_framework import serializers

from apps.clinics.ccr_defaults import CONSULTATION_REQUIRED_FIELD_CHOICES
from apps.clinics.models import ClinicCcrSettings, ClinicDisabilityType


class ClinicDisabilityTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicDisabilityType
        fields = ["id", "clinic", "sort_order", "label", "is_active", "created_at", "updated_at"]
        read_only_fields = ["id", "clinic", "created_at", "updated_at"]


class ClinicCcrSettingsSerializer(serializers.ModelSerializer):
    required_field_choices = serializers.SerializerMethodField()

    class Meta:
        model = ClinicCcrSettings
        fields = [
            "project_name",
            "state_region",
            "township_mimu",
            "village_mimu",
            "population_type",
            "idp_location",
            "consultant_name",
            "consultant_position",
            "required_fields",
            "required_field_choices",
            "updated_at",
        ]
        read_only_fields = ["required_field_choices", "updated_at"]

    def get_required_field_choices(self, _obj) -> list[str]:
        return list(CONSULTATION_REQUIRED_FIELD_CHOICES)
