from django.db import transaction
from rest_framework import serializers

from apps.clinics.models import Branch
from apps.clinics.scoping import header_branch_id
from apps.patients.permissions import Conflict
from apps.patients.models import (
    Patient,
    PatientAddress,
    PatientAllergy,
    PatientContact,
    PatientDocument,
    PatientMedicalHistory,
)
from apps.patients.demographics import approximate_date_of_birth_from_age, patient_age_in_years
from apps.patients.services import next_patient_number


class PatientSerializer(serializers.ModelSerializer):
    age = serializers.IntegerField(min_value=0, max_value=150, required=False, write_only=True)

    class Meta:
        model = Patient
        fields = [
            "id",
            "patient_number",
            "clinic",
            "branch",
            "full_name",
            "date_of_birth",
            "dob_is_approximate",
            "age",
            "sex",
            "is_active",
            "version",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "patient_number", "clinic", "created_at", "updated_at", "created_by"]
        extra_kwargs = {
            "dob_is_approximate": {"read_only": True},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and "branch" in self.fields:
            clinic_id = request.user.clinic_id if request.user.is_authenticated else None
            if clinic_id:
                self.fields["branch"].queryset = Branch.objects.filter(clinic_id=clinic_id)
            elif request.user.is_authenticated and request.user.is_superuser:
                self.fields["branch"].queryset = Branch.objects.all()
            else:
                self.fields["branch"].queryset = Branch.objects.none()
            self.fields["branch"].required = False
        if self.instance is None:
            self.fields["version"].read_only = True
            self.fields["date_of_birth"].required = False
            self.fields["date_of_birth"].allow_null = True
        else:
            self.fields["version"].required = True

    def validate(self, attrs):
        request = self.context["request"]
        if self.instance is None and not request.user.clinic_id and not request.user.is_superuser:
            raise serializers.ValidationError("User is not assigned to a clinic.")
        header = header_branch_id(request)
        branch = attrs.get("branch")
        if self.instance is None and branch is None and header is not None:
            queryset = Branch.objects.filter(id=header, is_active=True)
            if request.user.clinic_id:
                queryset = queryset.filter(clinic_id=request.user.clinic_id)
            branch = queryset.first()
            if branch is None:
                raise serializers.ValidationError({"branch": "Branch is not authorized."})
            attrs["branch"] = branch
        if self.instance is None and attrs.get("branch") is None:
            raise serializers.ValidationError({"branch": "This field is required."})
        branch = attrs.get("branch", getattr(self.instance, "branch", None))
        if header is not None and branch is not None and branch.id != header:
            raise serializers.ValidationError({"branch": "Must match X-Branch-Id."})
        if self.instance is None and branch is not None and not branch.is_active:
            raise serializers.ValidationError({"branch": "Branch is not active."})

        age = attrs.pop("age", serializers.empty)
        attrs.pop("dob_is_approximate", None)
        has_age = age is not serializers.empty
        has_dob = "date_of_birth" in attrs and attrs["date_of_birth"] is not None

        if self.instance is None:
            if has_age and has_dob:
                raise serializers.ValidationError("Provide date of birth or age, not both.")
            if not has_age and not has_dob:
                raise serializers.ValidationError({"date_of_birth": "Date of birth or age is required."})
            self._resolved_dob_is_approximate = bool(has_age)
            if has_age:
                attrs["date_of_birth"] = approximate_date_of_birth_from_age(age)
        elif has_age or has_dob:
            if has_age and has_dob:
                raise serializers.ValidationError("Provide date of birth or age, not both.")
            self._resolved_dob_is_approximate = bool(has_age)
            if has_age:
                attrs["date_of_birth"] = approximate_date_of_birth_from_age(age)

        return attrs

    def _apply_dob_is_approximate(self, validated_data):
        if hasattr(self, "_resolved_dob_is_approximate"):
            validated_data["dob_is_approximate"] = self._resolved_dob_is_approximate
        return validated_data

    def to_representation(self, instance):
        data = super().to_representation(instance)
        data["age"] = patient_age_in_years(instance.date_of_birth)
        return data

    def create(self, validated_data):
        branch = validated_data["branch"]
        validated_data["clinic"] = branch.clinic
        validated_data = self._apply_dob_is_approximate(validated_data)
        with transaction.atomic():
            validated_data["patient_number"] = next_patient_number(branch.clinic)
            validated_data["version"] = 1
            patient = Patient(**validated_data)
            patient.save()
        return patient

    def update(self, instance, validated_data):
        if "version" not in validated_data:
            raise serializers.ValidationError({"version": "This field is required."})
        expected = validated_data.pop("version")
        if expected != instance.version:
            raise Conflict()
        validated_data = self._apply_dob_is_approximate(validated_data)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        instance.version = expected + 1
        instance.save()
        return instance


class PatientContactSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientContact
        fields = [
            "id",
            "patient",
            "clinic",
            "branch",
            "kind",
            "name",
            "value",
            "is_primary",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "patient", "clinic", "branch", "created_at", "updated_at", "created_by"]


class PatientAddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientAddress
        fields = [
            "id",
            "patient",
            "clinic",
            "branch",
            "line1",
            "line2",
            "city",
            "region",
            "postal_code",
            "country",
            "is_primary",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "patient", "clinic", "branch", "created_at", "updated_at", "created_by"]


class PatientAllergySerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientAllergy
        fields = [
            "id",
            "patient",
            "clinic",
            "branch",
            "substance",
            "reaction",
            "severity",
            "status",
            "supersedes",
            "recorded_at",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "patient",
            "clinic",
            "branch",
            "status",
            "created_at",
            "updated_at",
            "created_by",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        patient = self.context.get("patient")
        if patient is not None and "supersedes" in self.fields:
            self.fields["supersedes"].queryset = patient.allergies.all()

    def create(self, validated_data):
        supersedes = validated_data.get("supersedes")
        with transaction.atomic():
            allergy = PatientAllergy.objects.create(**validated_data)
            if supersedes is not None:
                supersedes.status = PatientAllergy.Status.CORRECTED
                supersedes.save(update_fields=["status", "updated_at"])
        return allergy


class PatientMedicalHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientMedicalHistory
        fields = [
            "id",
            "patient",
            "clinic",
            "branch",
            "title",
            "details",
            "onset_date",
            "status",
            "supersedes",
            "recorded_at",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "patient",
            "clinic",
            "branch",
            "status",
            "created_at",
            "updated_at",
            "created_by",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        patient = self.context.get("patient")
        if patient is not None and "supersedes" in self.fields:
            self.fields["supersedes"].queryset = patient.medical_histories.all()

    def create(self, validated_data):
        supersedes = validated_data.get("supersedes")
        with transaction.atomic():
            entry = PatientMedicalHistory.objects.create(**validated_data)
            if supersedes is not None:
                supersedes.status = PatientMedicalHistory.Status.CORRECTED
                supersedes.save(update_fields=["status", "updated_at"])
        return entry


class PatientDocumentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PatientDocument
        fields = [
            "id",
            "patient",
            "clinic",
            "branch",
            "title",
            "document_type",
            "file_name",
            "content_type",
            "byte_size",
            "storage_key",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "patient", "clinic", "branch", "created_at", "updated_at", "created_by"]
