from rest_framework import serializers

from apps.clinics.ccr_services import get_ccr_settings
from apps.clinics.models import ClinicDisabilityType
from apps.encounters.consultation_meta_services import suggest_patient_status
from apps.encounters.models import EncounterConsultationMeta


class EncounterConsultationMetaSerializer(serializers.ModelSerializer):
    suggested_patient_status = serializers.SerializerMethodField()
    disability_type_label = serializers.CharField(source="disability_type.label", read_only=True, default=None)
    required_fields = serializers.SerializerMethodField()

    class Meta:
        model = EncounterConsultationMeta
        fields = [
            "patient_status",
            "suggested_patient_status",
            "is_plw",
            "is_disabled",
            "disability_type",
            "disability_type_label",
            "referral_made",
            "referral_cause",
            "treatment",
            "remark",
            "required_fields",
            "updated_at",
        ]

    def get_required_fields(self, obj) -> list[str]:
        return list(get_ccr_settings(obj.encounter.clinic_id).required_fields or [])

    def get_suggested_patient_status(self, obj) -> str:
        encounter = obj.encounter
        return suggest_patient_status(
            patient_id=encounter.patient_id,
            clinic_id=encounter.clinic_id,
            encounter_id=encounter.id,
        )

    def validate_disability_type(self, value: ClinicDisabilityType | None):
        if value is None:
            return value
        encounter = self.context["encounter"]
        if value.clinic_id != encounter.clinic_id:
            raise serializers.ValidationError("Disability type must belong to this clinic.")
        if not value.is_active:
            raise serializers.ValidationError("Disability type is inactive.")
        return value

    def validate(self, attrs):
        is_disabled = attrs.get("is_disabled", getattr(self.instance, "is_disabled", False))
        disability_type = attrs.get("disability_type", getattr(self.instance, "disability_type", None))
        if is_disabled and disability_type is None:
            raise serializers.ValidationError({"disability_type": "Select a disability type when disability is marked."})
        if not is_disabled:
            attrs["disability_type"] = None
        referral_made = attrs.get("referral_made", getattr(self.instance, "referral_made", False))
        referral_cause = attrs.get("referral_cause", getattr(self.instance, "referral_cause", ""))
        if referral_made and not (referral_cause or "").strip():
            raise serializers.ValidationError({"referral_cause": "Cause of referral is required when referral is yes."})
        return attrs
