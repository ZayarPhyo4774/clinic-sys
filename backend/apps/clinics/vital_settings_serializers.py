from rest_framework import serializers

from apps.clinics.models import ClinicVitalSettings
from apps.encounters.vital_units import VITAL_UNIT_OPTIONS


class ClinicVitalSettingsSerializer(serializers.ModelSerializer):
    class Meta:
        model = ClinicVitalSettings
        fields = ["units"]

    def validate_units(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError("Must be a map of field names to unit labels.")
        cleaned = {}
        for field, unit in value.items():
            if field not in VITAL_UNIT_OPTIONS:
                raise serializers.ValidationError(f"Unknown vital field: {field}.")
            if unit not in VITAL_UNIT_OPTIONS[field]:
                raise serializers.ValidationError(f"Invalid unit for {field}: {unit}.")
            cleaned[field] = unit
        return cleaned
