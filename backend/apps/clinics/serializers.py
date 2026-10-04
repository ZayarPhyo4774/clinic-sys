from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from apps.accounts.models import User
from apps.clinics.doctor_display import doctor_profile_display_name
from apps.clinics.models import Branch, Clinic, Department, DoctorProfile, NurseProfile, Staff
from apps.clinics.scoping import header_branch_id


def validation_error(exc: DjangoValidationError):
    if getattr(exc, "message_dict", None):
        return serializers.ValidationError(exc.message_dict)
    return serializers.ValidationError(exc.messages)


def save_model(serializer, **kwargs):
    try:
        return serializer.save(**kwargs)
    except DjangoValidationError as exc:
        raise validation_error(exc) from exc


class ClinicSerializer(serializers.ModelSerializer):
    class Meta:
        model = Clinic
        fields = [
            "id",
            "name",
            "code",
            "timezone",
            "currency",
            "locale",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "created_by"]


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = [
            "id",
            "clinic",
            "name",
            "code",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "clinic", "created_at", "updated_at", "created_by"]

    def validate(self, attrs):
        request = self.context["request"]
        if self.instance is None and not request.user.clinic_id:
            raise serializers.ValidationError("User is not assigned to a clinic.")
        return attrs

    def create(self, validated_data):
        validated_data["clinic"] = self.context["request"].user.clinic
        return super().create(validated_data)


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = [
            "id",
            "clinic",
            "branch",
            "name",
            "code",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "clinic", "created_at", "updated_at", "created_by"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["branch"].queryset = _branch_queryset(self.context.get("request"))

    def validate(self, attrs):
        _require_clinic_user(self.context["request"], creating=self.instance is None)
        branch = attrs.get("branch", getattr(self.instance, "branch", None))
        _match_header_branch(self.context["request"], branch, "branch")
        return attrs


class StaffSerializer(serializers.ModelSerializer):
    user_email = serializers.EmailField(source="user.email", read_only=True)
    user_full_name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = Staff
        fields = [
            "id",
            "user",
            "user_email",
            "user_full_name",
            "clinic",
            "branch",
            "department",
            "staff_type",
            "job_title",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "clinic", "created_at", "updated_at", "created_by"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        self.fields["user"].queryset = _user_queryset(request)
        self.fields["branch"].queryset = _branch_queryset(request)
        self.fields["department"].queryset = _department_queryset(request)
        self.fields["department"].allow_null = True
        self.fields["department"].required = False
        if self.instance is not None:
            self.fields["user"].read_only = True

    def validate(self, attrs):
        _require_clinic_user(self.context["request"], creating=self.instance is None)
        branch = attrs.get("branch", getattr(self.instance, "branch", None))
        _match_header_branch(self.context["request"], branch, "branch")
        return attrs


class DoctorProfileSerializer(serializers.ModelSerializer):
    clinic = serializers.UUIDField(source="staff.clinic_id", read_only=True)
    branch = serializers.UUIDField(source="staff.branch_id", read_only=True)
    staff_full_name = serializers.SerializerMethodField()
    staff_email = serializers.EmailField(source="staff.user.email", read_only=True)

    class Meta:
        model = DoctorProfile
        fields = [
            "id",
            "staff",
            "clinic",
            "branch",
            "staff_full_name",
            "staff_email",
            "license_number",
            "specialty",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "clinic", "branch", "created_at", "updated_at", "created_by"]

    def get_staff_full_name(self, obj) -> str:
        return doctor_profile_display_name(obj)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["staff"].queryset = _staff_queryset(self.context.get("request"))
        if self.instance is not None:
            self.fields["staff"].read_only = True

    def validate(self, attrs):
        staff = attrs.get("staff", getattr(self.instance, "staff", None))
        _match_header_staff(self.context["request"], staff)
        return attrs


class NurseProfileSerializer(serializers.ModelSerializer):
    clinic = serializers.UUIDField(source="staff.clinic_id", read_only=True)
    branch = serializers.UUIDField(source="staff.branch_id", read_only=True)

    class Meta:
        model = NurseProfile
        fields = [
            "id",
            "staff",
            "clinic",
            "branch",
            "license_number",
            "grade",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "clinic", "branch", "created_at", "updated_at", "created_by"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["staff"].queryset = _staff_queryset(self.context.get("request"))
        if self.instance is not None:
            self.fields["staff"].read_only = True

    def validate(self, attrs):
        staff = attrs.get("staff", getattr(self.instance, "staff", None))
        _match_header_staff(self.context["request"], staff)
        return attrs


def _request_clinic_id(request):
    if request is None or not request.user.is_authenticated:
        return None
    return request.user.clinic_id


def _branch_queryset(request):
    clinic_id = _request_clinic_id(request)
    if clinic_id:
        return Branch.objects.filter(clinic_id=clinic_id)
    if request is not None and request.user.is_superuser:
        return Branch.objects.all()
    return Branch.objects.none()


def _department_queryset(request):
    clinic_id = _request_clinic_id(request)
    if clinic_id:
        return Department.objects.filter(clinic_id=clinic_id)
    if request is not None and request.user.is_superuser:
        return Department.objects.all()
    return Department.objects.none()


def _user_queryset(request):
    clinic_id = _request_clinic_id(request)
    if clinic_id:
        return User.objects.filter(clinic_id=clinic_id)
    if request is not None and request.user.is_superuser:
        return User.objects.all()
    return User.objects.none()


def _staff_queryset(request):
    clinic_id = _request_clinic_id(request)
    if clinic_id:
        return Staff.objects.filter(clinic_id=clinic_id)
    if request is not None and request.user.is_superuser:
        return Staff.objects.all()
    return Staff.objects.none()


def _require_clinic_user(request, *, creating: bool):
    if creating and not request.user.clinic_id:
        raise serializers.ValidationError("User is not assigned to a clinic.")


def _match_header_branch(request, branch, field: str):
    header = header_branch_id(request)
    if header and branch is not None and branch.id != header:
        raise serializers.ValidationError({field: "Must match X-Branch-Id."})


def _match_header_staff(request, staff):
    header = header_branch_id(request)
    if header and staff is not None and staff.branch_id != header:
        raise serializers.ValidationError({"staff": "Staff member is outside the selected branch."})
