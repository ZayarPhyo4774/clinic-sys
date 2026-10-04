from rest_framework import serializers

from apps.appointments.models import Appointment, DoctorSchedule
from apps.appointments.services import book_appointment
from apps.clinics.models import Branch, DoctorProfile, Staff
from apps.clinics.scoping import header_branch_id
from apps.clinics.serializer_mixins import DoctorFullNameMixin
from apps.patients.models import Patient


def _clinic_branches(user):
    if user.is_authenticated and user.clinic_id:
        return Branch.objects.filter(clinic_id=user.clinic_id)
    if user.is_authenticated and user.is_superuser:
        return Branch.objects.all()
    return Branch.objects.none()


def _prepare_branch(serializer):
    request = serializer.context.get("request")
    if request is None or "branch" not in serializer.fields:
        return
    serializer.fields["branch"].queryset = _clinic_branches(request.user)
    serializer.fields["branch"].required = False


def _resolve_branch(serializer, attrs):
    request = serializer.context["request"]
    if serializer.instance is None and not request.user.clinic_id and not request.user.is_superuser:
        raise serializers.ValidationError("User is not assigned to a clinic.")
    header = header_branch_id(request)
    branch = attrs.get("branch")
    if serializer.instance is None and branch is None and header is not None:
        queryset = Branch.objects.filter(id=header, is_active=True)
        if request.user.clinic_id:
            queryset = queryset.filter(clinic_id=request.user.clinic_id)
        branch = queryset.first()
        if branch is None:
            raise serializers.ValidationError({"branch": "Branch is not authorized."})
        attrs["branch"] = branch
    if serializer.instance is None and attrs.get("branch") is None:
        raise serializers.ValidationError({"branch": "This field is required."})
    branch = attrs.get("branch", getattr(serializer.instance, "branch", None))
    if header is not None and branch is not None and branch.id != header:
        raise serializers.ValidationError({"branch": "Must match X-Branch-Id."})
    if serializer.instance is None and branch is not None and not branch.is_active:
        raise serializers.ValidationError({"branch": "Branch is not active."})
    return attrs


class DoctorScheduleSerializer(serializers.ModelSerializer):
    class Meta:
        model = DoctorSchedule
        fields = [
            "id",
            "clinic",
            "branch",
            "doctor",
            "weekday",
            "start_time",
            "end_time",
            "slot_minutes",
            "effective_from",
            "effective_until",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "clinic", "created_at", "updated_at", "created_by"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _prepare_branch(self)
        request = self.context.get("request")
        if request is not None and "doctor" in self.fields:
            doctors = DoctorProfile.objects.filter(staff__staff_type=Staff.StaffType.DOCTOR)
            if request.user.is_authenticated and request.user.clinic_id:
                doctors = doctors.filter(staff__clinic_id=request.user.clinic_id)
            elif not (request.user.is_authenticated and request.user.is_superuser):
                doctors = DoctorProfile.objects.none()
            header = header_branch_id(request) if request.user.is_authenticated else None
            if header is not None:
                doctors = doctors.filter(staff__branch_id=header)
            if self.instance is None:
                doctors = doctors.filter(staff__is_active=True)
            self.fields["doctor"].queryset = doctors
        if self.instance is not None:
            for name in ("doctor", "branch", "weekday"):
                self.fields[name].read_only = True

    def validate(self, attrs):
        return _resolve_branch(self, attrs)


class AppointmentSerializer(DoctorFullNameMixin, serializers.ModelSerializer):
    class Meta:
        model = Appointment
        fields = [
            "id",
            "clinic",
            "branch",
            "patient",
            "doctor",
            "doctor_full_name",
            "schedule",
            "starts_at",
            "ends_at",
            "status",
            "visit_reason",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = [
            "id",
            "clinic",
            "schedule",
            "doctor_full_name",
            "status",
            "created_at",
            "updated_at",
            "created_by",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        _prepare_branch(self)
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return
        clinic_id = request.user.clinic_id
        patients = Patient.objects.filter(is_active=True)
        doctors = DoctorProfile.objects.filter(
            staff__staff_type=Staff.StaffType.DOCTOR,
            staff__is_active=True,
        )
        if clinic_id:
            patients = patients.filter(clinic_id=clinic_id)
            doctors = doctors.filter(staff__clinic_id=clinic_id)
        elif not request.user.is_superuser:
            patients = Patient.objects.none()
            doctors = DoctorProfile.objects.none()
        header = header_branch_id(request)
        if header is not None:
            doctors = doctors.filter(staff__branch_id=header)
        self.fields["patient"].queryset = patients
        self.fields["doctor"].queryset = doctors

    def validate(self, attrs):
        attrs = _resolve_branch(self, attrs)
        branch = attrs.get("branch")
        doctor = attrs.get("doctor")
        if branch is not None and doctor is not None and doctor.staff.branch_id != branch.id:
            raise serializers.ValidationError({"doctor": "Doctor is not at this branch."})
        return attrs

    def create(self, validated_data):
        return book_appointment(
            branch=validated_data["branch"],
            patient=validated_data["patient"],
            doctor=validated_data["doctor"],
            starts_at=validated_data["starts_at"],
            ends_at=validated_data["ends_at"],
            visit_reason=validated_data.get("visit_reason", ""),
            created_by=validated_data.get("created_by"),
        )


class RescheduleSerializer(serializers.Serializer):
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()


class WalkInSerializer(serializers.Serializer):
    patient = serializers.PrimaryKeyRelatedField(queryset=Patient.objects.none())
    doctor = serializers.PrimaryKeyRelatedField(queryset=DoctorProfile.objects.none())
    visit_reason = serializers.CharField(max_length=120, required=False, allow_blank=True, default="Walk-in")
    starts_at = serializers.DateTimeField(required=False)
    ends_at = serializers.DateTimeField(required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return
        clinic_id = request.user.clinic_id
        patients = Patient.objects.filter(is_active=True)
        doctors = DoctorProfile.objects.filter(
            staff__staff_type=Staff.StaffType.DOCTOR,
            staff__is_active=True,
        )
        if clinic_id:
            patients = patients.filter(clinic_id=clinic_id)
            doctors = doctors.filter(staff__clinic_id=clinic_id)
        elif not request.user.is_superuser:
            patients = Patient.objects.none()
            doctors = DoctorProfile.objects.none()
        header = header_branch_id(request)
        if header is not None:
            doctors = doctors.filter(staff__branch_id=header)
        self.fields["patient"].queryset = patients
        self.fields["doctor"].queryset = doctors

    def validate(self, attrs):
        request = self.context["request"]
        if not request.user.clinic_id and not request.user.is_superuser:
            raise serializers.ValidationError("User is not assigned to a clinic.")
        header = header_branch_id(request)
        if header is None:
            raise serializers.ValidationError({"branch": "Select a branch before checking in walk-ins."})
        branch = Branch.objects.filter(id=header, is_active=True).first()
        if branch is None:
            raise serializers.ValidationError({"branch": "Branch is not authorized."})
        if request.user.clinic_id and branch.clinic_id != request.user.clinic_id:
            raise serializers.ValidationError({"branch": "Branch is outside this clinic."})
        doctor = attrs["doctor"]
        if doctor.staff.branch_id != branch.id:
            raise serializers.ValidationError({"doctor": "Doctor is not at this branch."})
        starts_at = attrs.get("starts_at")
        ends_at = attrs.get("ends_at")
        if (starts_at is None) ^ (ends_at is None):
            raise serializers.ValidationError({"starts_at": "Provide both start and end times, or neither."})
        if starts_at is not None and ends_at is not None and ends_at <= starts_at:
            raise serializers.ValidationError({"ends_at": "End time must be after start time."})
        attrs["branch"] = branch
        return attrs
