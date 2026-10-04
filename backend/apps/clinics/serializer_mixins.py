from rest_framework import serializers

from apps.clinics.doctor_display import doctor_field_display_name


class DoctorFullNameMixin(serializers.Serializer):
    doctor_full_name = serializers.SerializerMethodField()

    def get_doctor_full_name(self, obj) -> str:
        return doctor_field_display_name(getattr(obj, "doctor", None))
