from rest_framework import serializers

from apps.clinics.scoping import header_branch_id
from apps.encounters.models import Encounter
from apps.laboratory.models import LabOrder, LabOrderItem, LabResult, LabTest
from apps.clinics.serializer_mixins import DoctorFullNameMixin
from apps.laboratory.services import add_item, record_result


class LabTestSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabTest
        fields = [
            "id",
            "clinic",
            "name",
            "code",
            "specimen",
            "unit",
            "reference_low",
            "reference_high",
            "reference_text",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "clinic", "created_at", "updated_at", "created_by"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None and "code" in self.fields:
            self.fields["code"].read_only = True


class LabOrderSerializer(DoctorFullNameMixin, serializers.ModelSerializer):
    class Meta:
        model = LabOrder
        fields = [
            "id",
            "encounter",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "doctor_full_name",
            "status",
            "reported_at",
            "reported_by",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "doctor_full_name",
            "status",
            "reported_at",
            "reported_by",
            "created_at",
            "updated_at",
            "created_by",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or "encounter" not in self.fields:
            return
        encounters = Encounter.objects.filter(status=Encounter.Status.OPEN)
        user = request.user
        if user.is_authenticated and user.clinic_id:
            encounters = encounters.filter(clinic_id=user.clinic_id)
        elif not (user.is_authenticated and user.is_superuser):
            encounters = Encounter.objects.none()
        if user.is_authenticated:
            header = header_branch_id(request)
            if header is not None:
                encounters = encounters.filter(branch_id=header)
        self.fields["encounter"].queryset = encounters


class LabOrderItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabOrderItem
        fields = [
            "id",
            "order",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "lab_test",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "order",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "created_at",
            "updated_at",
            "created_by",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or "lab_test" not in self.fields:
            return
        tests = LabTest.objects.filter(is_active=True)
        user = request.user
        if user.is_authenticated and user.clinic_id:
            tests = tests.filter(clinic_id=user.clinic_id)
        elif not (user.is_authenticated and user.is_superuser):
            tests = LabTest.objects.none()
        self.fields["lab_test"].queryset = tests

    def create(self, validated_data):
        return add_item(
            order_id=self.context["order"].pk,
            lab_test=validated_data["lab_test"],
            user=validated_data.get("created_by"),
        )


class LabResultSerializer(serializers.ModelSerializer):
    class Meta:
        model = LabResult
        fields = [
            "id",
            "order_item",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "value",
            "unit",
            "reference_low",
            "reference_high",
            "reference_text",
            "interpretation",
            "status",
            "supersedes",
            "recorded_at",
            "recorded_by",
            "verified_at",
            "verified_by",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "order_item",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "unit",
            "reference_low",
            "reference_high",
            "reference_text",
            "interpretation",
            "status",
            "recorded_at",
            "recorded_by",
            "verified_at",
            "verified_by",
            "created_at",
            "updated_at",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        item = self.context.get("item")
        if item is not None and "supersedes" in self.fields:
            self.fields["supersedes"].queryset = LabResult.objects.filter(order_item=item)
            self.fields["supersedes"].required = False
            self.fields["supersedes"].allow_null = True

    def create(self, validated_data):
        return record_result(
            item_id=self.context["item"].pk,
            value=validated_data["value"],
            user=validated_data.get("recorded_by"),
            supersedes=validated_data.get("supersedes"),
        )
