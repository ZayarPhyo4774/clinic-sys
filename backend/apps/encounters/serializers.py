from django.db import transaction
from rest_framework import serializers

from apps.appointments.models import Appointment
from apps.clinics.scoping import header_branch_id
from apps.encounters.models import (
    ClinicalFact,
    ClinicalNote,
    Diagnosis,
    Encounter,
    FollowUp,
    Symptom,
    TreatmentPlan,
    VitalSign,
)
from apps.clinics.serializer_mixins import DoctorFullNameMixin
from apps.encounters.services import start_encounter


class EncounterSerializer(DoctorFullNameMixin, serializers.ModelSerializer):
    class Meta:
        model = Encounter
        fields = [
            "id",
            "appointment",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "doctor_full_name",
            "status",
            "started_at",
            "started_by",
            "completed_at",
            "completed_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "doctor_full_name",
            "status",
            "started_at",
            "started_by",
            "completed_at",
            "completed_by",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or "appointment" not in self.fields:
            return
        appointments = Appointment.objects.filter(status=Appointment.Status.IN_CONSULTATION)
        user = request.user
        if user.is_authenticated and user.clinic_id:
            appointments = appointments.filter(clinic_id=user.clinic_id)
        elif not (user.is_authenticated and user.is_superuser):
            appointments = Appointment.objects.none()
        if user.is_authenticated:
            header = header_branch_id(request)
            if header is not None:
                appointments = appointments.filter(branch_id=header)
        self.fields["appointment"].queryset = appointments

    def create(self, validated_data):
        return start_encounter(validated_data["appointment"].pk, validated_data["started_by"])


class FactSerializer(serializers.ModelSerializer):
    attribution = [
        "id",
        "encounter",
        "clinic",
        "branch",
        "patient",
        "doctor",
        "status",
        "supersedes",
        "recorded_at",
        "recorded_by",
        "created_at",
        "updated_at",
    ]
    read_only_attribution = [
        "id",
        "encounter",
        "clinic",
        "branch",
        "patient",
        "doctor",
        "status",
        "recorded_at",
        "recorded_by",
        "created_at",
        "updated_at",
    ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        encounter = self.context.get("encounter")
        if encounter is not None and "supersedes" in self.fields:
            self.fields["supersedes"].queryset = self.Meta.model.objects.filter(encounter=encounter)

    def create(self, validated_data):
        supersedes = validated_data.get("supersedes")
        with transaction.atomic():
            row = self.Meta.model.objects.create(**validated_data)
            if supersedes is not None:
                supersedes.status = ClinicalFact.Status.CORRECTED
                supersedes.save(update_fields=["status", "updated_at"])
        return row


class VitalSignSerializer(FactSerializer):
    class Meta:
        model = VitalSign
        fields = FactSerializer.attribution + [
            "temperature",
            "pulse",
            "respiratory_rate",
            "systolic",
            "diastolic",
            "spo2",
            "weight_kg",
            "height_cm",
        ]
        read_only_fields = FactSerializer.read_only_attribution


class SymptomSerializer(FactSerializer):
    class Meta:
        model = Symptom
        fields = FactSerializer.attribution + ["description"]
        read_only_fields = FactSerializer.read_only_attribution


class DiagnosisSerializer(FactSerializer):
    class Meta:
        model = Diagnosis
        fields = FactSerializer.attribution + ["code", "description"]
        read_only_fields = FactSerializer.read_only_attribution


class ClinicalNoteSerializer(FactSerializer):
    class Meta:
        model = ClinicalNote
        fields = FactSerializer.attribution + ["body"]
        read_only_fields = FactSerializer.read_only_attribution


class TreatmentPlanSerializer(FactSerializer):
    class Meta:
        model = TreatmentPlan
        fields = FactSerializer.attribution + ["title", "details"]
        read_only_fields = FactSerializer.read_only_attribution


class FollowUpSerializer(FactSerializer):
    class Meta:
        model = FollowUp
        fields = FactSerializer.attribution + ["follow_up_on", "note"]
        read_only_fields = FactSerializer.read_only_attribution
