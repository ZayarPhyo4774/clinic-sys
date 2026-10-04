from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import viewsets
from rest_framework.exceptions import MethodNotAllowed, PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import OrderingFilter, SearchFilter

from apps.audit.services import client_ip, record_audit_event
from apps.clinics.models import Branch, Clinic, Department, DoctorProfile, NurseProfile, Staff
from apps.clinics.pagination import OrganizationPagination
from apps.clinics.permissions import DoctorProfilePermission, OrganizationPermission, StaffReadPermission
from apps.clinics.services import sync_doctor_profiles_for_clinic
from apps.clinics.scoping import apply_clinic_scope, header_branch_id, parse_bool, parse_uuid
from apps.clinics.serializers import (
    BranchSerializer,
    ClinicSerializer,
    DepartmentSerializer,
    DoctorProfileSerializer,
    NurseProfileSerializer,
    StaffSerializer,
    save_model,
)

_READ_ACTIONS = ("list", "retrieve")
_WRITE_ACTIONS = ("create", "update", "partial_update")


def _permission_map(view_code: str, manage_code: str) -> dict[str, str]:
    mapping = {action: view_code for action in _READ_ACTIONS}
    mapping.update({action: manage_code for action in _WRITE_ACTIONS})
    mapping["destroy"] = manage_code
    return mapping


class OrganizationViewSet(viewsets.ModelViewSet):
    permission_classes = [OrganizationPermission]
    pagination_class = OrganizationPagination
    filter_backends = [SearchFilter, OrderingFilter]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    clinic_lookup = "clinic_id"
    branch_lookup = None
    active_lookup = "is_active"
    branch_query_param = False
    audit_entity = ""
    audit_action = ""

    def get_queryset(self):
        queryset = apply_clinic_scope(super().get_queryset(), self.request.user, self.clinic_lookup)
        header_branch = header_branch_id(self.request)
        query_branch = None
        if self.branch_query_param:
            query_branch = parse_uuid(self.request.query_params.get("branch"), "branch")
        if header_branch and query_branch and header_branch != query_branch:
            raise DRFValidationError({"branch": "Must match X-Branch-Id."})
        selected_branch = header_branch or query_branch
        if selected_branch and self.branch_lookup:
            queryset = queryset.filter(**{self.branch_lookup: selected_branch})
        active = parse_bool(self.request.query_params.get("is_active"), "is_active")
        if active is not None and self.active_lookup:
            queryset = queryset.filter(**{self.active_lookup: active})
        return queryset

    def perform_create(self, serializer):
        try:
            instance = save_model(serializer, created_by=self.request.user)
        except DjangoValidationError as exc:
            raise _drf_validation(exc) from exc
        self._audit(instance, "created")

    def perform_update(self, serializer):
        try:
            instance = save_model(serializer)
        except DjangoValidationError as exc:
            raise _drf_validation(exc) from exc
        self._audit(instance, "updated")

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed("DELETE")

    def _audit(self, instance, result: str):
        clinic, branch = _audit_scope(instance)
        record_audit_event(
            actor=self.request.user,
            action=f"{self.audit_action}_{result}",
            entity_type=self.audit_entity,
            entity_id=instance.id,
            clinic=clinic,
            branch=branch,
            ip_address=client_ip(self.request),
            metadata={"result": result},
        )


class ClinicViewSet(OrganizationViewSet):
    queryset = Clinic.objects.select_related("created_by")
    serializer_class = ClinicSerializer
    permission_map = _permission_map("clinics.view", "clinics.manage")
    search_fields = ["name", "code"]
    ordering_fields = ["name", "created_at"]
    clinic_lookup = "id"
    audit_entity = "clinics.Clinic"
    audit_action = "clinics.clinic"

    def create(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            raise PermissionDenied(detail="Only an operator can create a clinic.")
        return super().create(request, *args, **kwargs)


class BranchViewSet(OrganizationViewSet):
    queryset = Branch.objects.select_related("clinic", "created_by")
    serializer_class = BranchSerializer
    permission_map = _permission_map("branches.view", "branches.manage")
    search_fields = ["name", "code"]
    ordering_fields = ["name", "created_at"]
    branch_lookup = "id"
    audit_entity = "clinics.Branch"
    audit_action = "clinics.branch"


class DepartmentViewSet(OrganizationViewSet):
    queryset = Department.objects.select_related("clinic", "branch", "created_by")
    serializer_class = DepartmentSerializer
    permission_map = _permission_map("departments.view", "departments.manage")
    search_fields = ["name", "code"]
    ordering_fields = ["name", "created_at"]
    branch_lookup = "branch_id"
    branch_query_param = True
    audit_entity = "clinics.Department"
    audit_action = "clinics.department"


class StaffViewSet(OrganizationViewSet):
    queryset = Staff.objects.select_related("user", "clinic", "branch", "department", "created_by")
    serializer_class = StaffSerializer
    permission_classes = [StaffReadPermission]
    permission_map = _permission_map("staff.view", "staff.manage")
    search_fields = ["user__full_name", "user__email", "job_title"]
    ordering_fields = ["created_at", "staff_type"]
    branch_lookup = "branch_id"
    branch_query_param = True
    audit_entity = "clinics.Staff"
    audit_action = "clinics.staff"

    def get_queryset(self):
        queryset = super().get_queryset()
        department_id = parse_uuid(self.request.query_params.get("department"), "department")
        if department_id:
            queryset = queryset.filter(department_id=department_id)
        staff_type = self.request.query_params.get("staff_type", "")
        if staff_type:
            if staff_type not in Staff.StaffType.values:
                raise DRFValidationError({"staff_type": "Must be doctor, nurse, or other."})
            queryset = queryset.filter(staff_type=staff_type)
        return queryset


class DoctorProfileViewSet(OrganizationViewSet):
    queryset = DoctorProfile.objects.select_related("staff", "staff__user", "staff__branch", "created_by")
    serializer_class = DoctorProfileSerializer
    permission_classes = [DoctorProfilePermission]
    permission_map = _permission_map("staff.view", "staff.manage")
    search_fields = ["license_number", "specialty", "staff__user__full_name"]
    ordering_fields = ["specialty", "created_at"]
    clinic_lookup = "staff__clinic_id"
    branch_lookup = "staff__branch_id"
    active_lookup = "staff__is_active"
    branch_query_param = True
    audit_entity = "clinics.DoctorProfile"
    audit_action = "clinics.doctor_profile"

    def get_queryset(self):
        queryset = super().get_queryset()
        staff_id = parse_uuid(self.request.query_params.get("staff"), "staff")
        if staff_id:
            queryset = queryset.filter(staff_id=staff_id)
        specialty = self.request.query_params.get("specialty", "").strip()
        if specialty:
            queryset = queryset.filter(specialty__icontains=specialty)
        return queryset

    def list(self, request, *args, **kwargs):
        if request.user.clinic_id:
            sync_doctor_profiles_for_clinic(request.user.clinic_id)
        return super().list(request, *args, **kwargs)


class NurseProfileViewSet(OrganizationViewSet):
    queryset = NurseProfile.objects.select_related("staff", "staff__user", "staff__branch", "created_by")
    serializer_class = NurseProfileSerializer
    permission_map = _permission_map("staff.view", "staff.manage")
    search_fields = ["license_number", "grade", "staff__user__full_name"]
    ordering_fields = ["license_number", "created_at"]
    clinic_lookup = "staff__clinic_id"
    branch_lookup = "staff__branch_id"
    active_lookup = "staff__is_active"
    branch_query_param = True
    audit_entity = "clinics.NurseProfile"
    audit_action = "clinics.nurse_profile"

    def get_queryset(self):
        queryset = super().get_queryset()
        staff_id = parse_uuid(self.request.query_params.get("staff"), "staff")
        if staff_id:
            queryset = queryset.filter(staff_id=staff_id)
        return queryset


def _audit_scope(instance):
    if isinstance(instance, Clinic):
        return instance, None
    if isinstance(instance, Branch):
        return instance.clinic, instance
    if isinstance(instance, (DoctorProfile, NurseProfile)):
        return instance.staff.clinic, instance.staff.branch
    return getattr(instance, "clinic", None), getattr(instance, "branch", None)


def _drf_validation(exc: DjangoValidationError):
    if getattr(exc, "message_dict", None):
        return DRFValidationError(exc.message_dict)
    return DRFValidationError(exc.messages)
