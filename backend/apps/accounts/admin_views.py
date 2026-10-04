from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.models import Permission, Role, User, UserRole
from apps.accounts.permissions import BranchScopedPermission, extract_branch_id
from apps.accounts.services import clinic_permissions_for_user, permissions_for_user
from apps.audit.services import client_ip, record_audit_event
from apps.clinics.models import Branch


def _validation(exc: DjangoValidationError) -> DRFValidationError:
    if getattr(exc, "error_dict", None):
        return DRFValidationError(exc.message_dict)
    return DRFValidationError(exc.messages)


def _require_clinic(user) -> str:
    if not user.clinic_id:
        raise PermissionDenied("User is not assigned to a clinic.")
    return str(user.clinic_id)


def _audit_admin(request, instance, entity_type: str, action: str, *, result: str = "created"):
    clinic = getattr(instance, "clinic", None) or request.user.clinic
    branch = getattr(instance, "branch", None)
    if isinstance(instance, UserRole):
        clinic = instance.user.clinic
        branch = instance.branch
    if isinstance(instance, User):
        clinic = instance.clinic
        branch = None
    record_audit_event(
        actor=request.user,
        action=action,
        entity_type=entity_type,
        entity_id=instance.id,
        clinic=clinic,
        branch=branch,
        ip_address=client_ip(request),
        metadata={"result": result},
    )


class ClinicPermissionCatalogView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "roles.manage"

    def get(self, request, **kwargs):
        _require_clinic(request.user)
        rows = Permission.objects.order_by("code")
        return Response({"results": [{"code": row.code, "description": row.description} for row in rows]})


class ClinicUserView(APIView):
    permission_classes = [BranchScopedPermission]

    def dispatch(self, request, *args, **kwargs):
        if request.method == "GET":
            self.required_permission = None
        else:
            self.required_permission = "users.manage"
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, **kwargs):
        clinic_id = _require_clinic(request.user)
        clinic_codes = clinic_permissions_for_user(request.user)
        if (
            not request.user.is_superuser
            and "users.manage" not in clinic_codes
            and "roles.manage" not in clinic_codes
            and "staff.manage" not in clinic_codes
        ):
            raise PermissionDenied("You do not have permission to list users.")
        rows = User.objects.filter(clinic_id=clinic_id).order_by("email")[:200]
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "email": row.email,
                        "full_name": row.full_name,
                        "is_active": row.is_active,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, **kwargs):
        clinic = request.user.clinic
        if clinic is None:
            raise PermissionDenied("User is not assigned to a clinic.")
        email = (request.data.get("email") or "").strip()
        full_name = (request.data.get("full_name") or "").strip()
        password = request.data.get("password") or ""
        if not email:
            raise DRFValidationError({"email": "Email is required."})
        if not full_name:
            raise DRFValidationError({"full_name": "Full name is required."})
        user = User(email=email, full_name=full_name, clinic=clinic, is_active=True)
        try:
            validate_password(password, user)
        except DjangoValidationError as exc:
            raise DRFValidationError({"password": exc.messages}) from exc
        try:
            user = User.objects.create_user(
                email=email,
                password=password,
                full_name=full_name,
                clinic=clinic,
            )
        except IntegrityError as exc:
            raise DRFValidationError({"email": "A user with this email already exists."}) from exc
        _audit_admin(request, user, "accounts.User", "admin.user_created")
        return Response({"id": str(user.id), "email": user.email, "full_name": user.full_name}, status=201)


class ClinicRoleView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "roles.manage"

    def get(self, request, **kwargs):
        clinic_id = _require_clinic(request.user)
        rows = Role.objects.filter(clinic_id=clinic_id).prefetch_related("permissions").order_by("name")
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "name": row.name,
                        "code": row.code,
                        "permissions": sorted(item.code for item in row.permissions.all()),
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, **kwargs):
        clinic = request.user.clinic
        if clinic is None:
            raise PermissionDenied("User is not assigned to a clinic.")
        codes = request.data.get("permissions") or []
        if not isinstance(codes, list) or not codes:
            raise DRFValidationError({"permissions": "Choose at least one permission."})
        found = list(Permission.objects.filter(code__in=codes))
        if len(found) != len(set(codes)):
            raise DRFValidationError({"permissions": "One or more permission codes are invalid."})
        role = Role(clinic=clinic, name=request.data.get("name") or "", code=request.data.get("code") or "")
        try:
            with transaction.atomic():
                role.save()
                role.permissions.set(found)
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        except IntegrityError as exc:
            raise DRFValidationError({"code": "A role with this code already exists."}) from exc
        _audit_admin(request, role, "accounts.Role", "admin.role_created")
        return Response({"id": str(role.id), "name": role.name, "code": role.code}, status=201)


class ClinicAssignmentView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "roles.manage"

    def get(self, request, **kwargs):
        clinic_id = _require_clinic(request.user)
        rows = (
            UserRole.objects.filter(user__clinic_id=clinic_id)
            .select_related("user", "role", "branch")
            .order_by("-created_at")[:200]
        )
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "user_id": str(row.user_id),
                        "user_email": row.user.email,
                        "role_id": str(row.role_id),
                        "role_name": row.role.name,
                        "branch_id": str(row.branch_id) if row.branch_id else None,
                        "branch_name": row.branch.name if row.branch_id else None,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, **kwargs):
        clinic_id = _require_clinic(request.user)
        user = get_object_or_404(User, pk=request.data.get("user"), clinic_id=clinic_id)
        role = get_object_or_404(Role, pk=request.data.get("role"), clinic_id=clinic_id)
        branch = None
        branch_id = request.data.get("branch") or None
        if branch_id:
            branch = get_object_or_404(Branch, pk=branch_id, clinic_id=clinic_id)
        assignment = UserRole(user=user, role=role, branch=branch)
        try:
            assignment.save()
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        except IntegrityError as exc:
            raise DRFValidationError({"role": "This role is already assigned."}) from exc
        _audit_admin(request, assignment, "accounts.UserRole", "admin.role_assigned")
        from apps.notifications.models import Notification
        from apps.notifications.services import record_notification

        branch_label = branch.name if branch else "all branches"
        record_notification(
            recipient=user,
            clinic=user.clinic,
            branch=branch,
            title="Role assigned",
            message=f"You were assigned the {role.name} role for {branch_label}.",
            kind=Notification.Kind.ASSIGNMENT,
        )
        return Response({"id": str(assignment.id)}, status=201)


class ClinicUserDetailView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "users.manage"

    def patch(self, request, user_id, **kwargs):
        clinic_id = _require_clinic(request.user)
        user = get_object_or_404(User, pk=user_id, clinic_id=clinic_id)
        if "is_active" in request.data:
            if user.id == request.user.id and not bool(request.data["is_active"]):
                raise DRFValidationError({"is_active": "You cannot deactivate your own account."})
            user.is_active = bool(request.data["is_active"])
        if "full_name" in request.data:
            user.full_name = request.data["full_name"] or ""
        try:
            user.save()
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        _audit_admin(request, user, "accounts.User", "admin.user_updated", result="updated")
        return Response(
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "is_active": user.is_active,
            }
        )


class ClinicRoleDetailView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "roles.manage"

    def patch(self, request, role_id, **kwargs):
        clinic_id = _require_clinic(request.user)
        role = get_object_or_404(Role.objects.prefetch_related("permissions"), pk=role_id, clinic_id=clinic_id)
        if "name" in request.data:
            role.name = request.data["name"] or ""
        codes = request.data.get("permissions")
        if codes is not None:
            if not isinstance(codes, list) or not codes:
                raise DRFValidationError({"permissions": "Choose at least one permission."})
            found = list(Permission.objects.filter(code__in=codes))
            if len(found) != len(set(codes)):
                raise DRFValidationError({"permissions": "One or more permission codes are invalid."})
            role.permissions.set(found)
        try:
            role.save()
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        _audit_admin(request, role, "accounts.Role", "admin.role_updated", result="updated")
        return Response(
            {
                "id": str(role.id),
                "name": role.name,
                "code": role.code,
                "permissions": sorted(item.code for item in role.permissions.all()),
            }
        )


class ClinicAssignmentDetailView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "roles.manage"

    def delete(self, request, assignment_id, **kwargs):
        clinic_id = _require_clinic(request.user)
        assignment = get_object_or_404(
            UserRole.objects.select_related("user", "role", "branch"),
            pk=assignment_id,
            user__clinic_id=clinic_id,
        )
        _audit_admin(request, assignment, "accounts.UserRole", "admin.role_unassigned", result="deleted")
        assignment.delete()
        return Response(status=204)
