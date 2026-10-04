from rest_framework import serializers

from apps.clinics.scoping import header_branch_id
from apps.encounters.models import Encounter
from apps.pharmacy.models import Medicine, MedicineBatch
from apps.clinics.serializer_mixins import DoctorFullNameMixin
from apps.prescriptions.models import Prescription, PrescriptionItem


class PrescriptionSerializer(DoctorFullNameMixin, serializers.ModelSerializer):
    class Meta:
        model = Prescription
        fields = [
            "id",
            "encounter",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "doctor_full_name",
            "status",
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


class PrescriptionItemSerializer(serializers.ModelSerializer):
    medicine_unit = serializers.CharField(source="medicine.unit", read_only=True)

    class Meta:
        model = PrescriptionItem
        fields = [
            "id",
            "prescription",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "medicine",
            "medicine_unit",
            "quantity",
            "quantity_dispensed",
            "dosage",
            "frequency",
            "duration_days",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "prescription",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "medicine_unit",
            "quantity_dispensed",
            "created_at",
            "updated_at",
            "created_by",
        ]
        extra_kwargs = {"quantity": {"min_value": 1}}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or "medicine" not in self.fields:
            return
        medicines = Medicine.objects.filter(is_active=True)
        user = request.user
        if user.is_authenticated and user.clinic_id:
            medicines = medicines.filter(clinic_id=user.clinic_id)
        elif not (user.is_authenticated and user.is_superuser):
            medicines = Medicine.objects.none()
        self.fields["medicine"].queryset = medicines


class DispenseSerializer(serializers.Serializer):
    batch = serializers.PrimaryKeyRelatedField(queryset=MedicineBatch.objects.none())
    quantity = serializers.IntegerField(min_value=1)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None:
            return
        batches = MedicineBatch.objects.all()
        user = request.user
        if user.is_authenticated and user.clinic_id:
            batches = batches.filter(clinic_id=user.clinic_id)
        elif not (user.is_authenticated and user.is_superuser):
            batches = MedicineBatch.objects.none()
        self.fields["batch"].queryset = batches
