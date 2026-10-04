from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.default_roles import ensure_permission_catalog, install_default_roles, preview_default_roles
from apps.accounts.models import Permission, Role, User, UserRole
from apps.audit.services import client_ip, record_audit_event
from apps.clinics.models import Branch, Clinic
from apps.patients.models import Patient


class OperatorPermission(BasePermission):
    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_superuser)


def _validation(exc: DjangoValidationError) -> DRFValidationError:
    if getattr(exc, "error_dict", None):
        return DRFValidationError(exc.message_dict)
    return DRFValidationError(exc.messages)


def _audit_context(instance):
    if isinstance(instance, UserRole):
        return instance.user.clinic, instance.branch
    if isinstance(instance, User):
        return instance.clinic, None
    if isinstance(instance, Branch):
        return instance.clinic, instance
    if isinstance(instance, Clinic):
        return instance, None
    return getattr(instance, "clinic", None), getattr(instance, "branch", None)


def _audit(request, instance, entity_type, action, *, result="created"):
    clinic, branch = _audit_context(instance)
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


class OperatorClinicView(APIView):
    permission_classes = [OperatorPermission]

    def get(self, request, **kwargs):
        rows = Clinic.objects.order_by("name")[:200]
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "name": row.name,
                        "code": row.code,
                        "timezone": row.timezone,
                        "currency": row.currency,
                        "is_active": row.is_active,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, **kwargs):
        clinic = Clinic(
            name=request.data.get("name") or "",
            code=request.data.get("code") or "",
            timezone=request.data.get("timezone") or "UTC",
            currency=request.data.get("currency") or "USD",
            locale=request.data.get("locale") or "en",
            created_by=request.user,
        )
        try:
            clinic.save()
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        _audit(request, clinic, "clinics.Clinic", "operator.clinic_created")
        return Response({"id": str(clinic.id), "name": clinic.name, "code": clinic.code}, status=201)


class OperatorBranchView(APIView):
    permission_classes = [OperatorPermission]

    def get(self, request, **kwargs):
        rows = Branch.objects.select_related("clinic").order_by("name")[:200]
        clinic_id = request.query_params.get("clinic")
        if clinic_id:
            rows = rows.filter(clinic_id=clinic_id)
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "clinic": str(row.clinic_id),
                        "name": row.name,
                        "code": row.code,
                        "is_active": row.is_active,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, **kwargs):
        clinic = get_object_or_404(Clinic, pk=request.data.get("clinic"))
        branch = Branch(
            clinic=clinic,
            name=request.data.get("name") or "",
            code=request.data.get("code") or "",
            created_by=request.user,
        )
        try:
            branch.save()
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        except IntegrityError as exc:
            raise DRFValidationError({"code": "A branch with this code already exists."}) from exc
        _audit(request, branch, "clinics.Branch", "operator.branch_created")
        return Response(
            {"id": str(branch.id), "clinic": str(branch.clinic_id), "name": branch.name, "code": branch.code},
            status=201,
        )


class OperatorPermissionView(APIView):
    permission_classes = [OperatorPermission]

    def get(self, request, **kwargs):
        rows = Permission.objects.order_by("code")
        return Response(
            {"results": [{"code": row.code, "description": row.description} for row in rows]}
        )

    def post(self, request, **kwargs):
        created = ensure_permission_catalog()
        record_audit_event(
            actor=request.user,
            action="operator.permissions_installed",
            entity_type="accounts.Permission",
            ip_address=client_ip(request),
            metadata={"result": "created"},
        )
        return Response({"created": created, "total": Permission.objects.count()})


class OperatorClinicDefaultRoleInstallView(APIView):
    permission_classes = [OperatorPermission]

    def get(self, request, clinic_id, **kwargs):
        clinic = get_object_or_404(Clinic, pk=clinic_id)
        update_existing = str(request.query_params.get("update_existing", "")).lower() in {"1", "true", "yes"}
        preview = preview_default_roles(clinic, update_existing=update_existing)
        return Response(
            {
                "clinic_id": str(clinic.id),
                "update_existing": update_existing,
                **preview,
            }
        )

    def post(self, request, clinic_id, **kwargs):
        clinic = get_object_or_404(Clinic, pk=clinic_id)
        update_existing = bool(request.data.get("update_existing", False))

        created_permissions = ensure_permission_catalog()

        role_result = install_default_roles(clinic, update_existing=update_existing)

        record_audit_event(
            actor=request.user,
            action="operator.default_roles_installed",
            entity_type="accounts.Role",
            clinic=clinic,
            ip_address=client_ip(request),
            metadata={
                "result": "created",
                "created_permissions": created_permissions,
                "update_existing": update_existing,
                **role_result,
            },
        )
        return Response(
            {
                "clinic_id": str(clinic.id),
                "created_permissions": created_permissions,
                **role_result,
            }
        )


class OperatorRoleView(APIView):
    permission_classes = [OperatorPermission]

    def get(self, request, **kwargs):
        rows = Role.objects.prefetch_related("permissions").order_by("name")[:200]
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "clinic": str(row.clinic_id),
                        "name": row.name,
                        "code": row.code,
                        "permissions": sorted(item.code for item in row.permissions.all()),
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, **kwargs):
        clinic = get_object_or_404(Clinic, pk=request.data.get("clinic"))
        codes = request.data.get("permissions") or []
        if not isinstance(codes, list) or not codes:
            raise DRFValidationError({"permissions": "Choose at least one module permission."})
        found = list(Permission.objects.filter(code__in=codes))
        if len(found) != len(set(codes)):
            raise DRFValidationError({"permissions": "Install module access before creating a role."})
        role = Role(clinic=clinic, name=request.data.get("name") or "", code=request.data.get("code") or "")
        try:
            with transaction.atomic():
                role.save()
                role.permissions.set(found)
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        except IntegrityError as exc:
            raise DRFValidationError({"code": "A role with this code already exists."}) from exc
        _audit(request, role, "accounts.Role", "operator.role_created")
        return Response({"id": str(role.id), "name": role.name, "code": role.code}, status=201)


class OperatorUserView(APIView):
    permission_classes = [OperatorPermission]

    def get(self, request, **kwargs):
        rows = User.objects.select_related("clinic").order_by("email")[:200]
        return Response(
            {
                "results": [
                    {
                        "id": str(row.id),
                        "email": row.email,
                        "full_name": row.full_name,
                        "clinic_id": str(row.clinic_id) if row.clinic_id else None,
                        "is_active": row.is_active,
                        "is_superuser": row.is_superuser,
                    }
                    for row in rows
                ]
            }
        )

    def post(self, request, **kwargs):
        clinic = get_object_or_404(Clinic, pk=request.data.get("clinic"))
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
        _audit(request, user, "accounts.User", "operator.user_created")
        return Response(
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "clinic_id": str(user.clinic_id),
            },
            status=201,
        )


class OperatorAssignmentView(APIView):
    permission_classes = [OperatorPermission]

    def get(self, request, **kwargs):
        rows = UserRole.objects.select_related("user", "role", "branch").order_by("-created_at")[:200]
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
        user = get_object_or_404(User, pk=request.data.get("user"))
        role = get_object_or_404(Role, pk=request.data.get("role"))
        branch = None
        branch_id = request.data.get("branch") or None
        if branch_id:
            branch = get_object_or_404(Branch, pk=branch_id)
        assignment = UserRole(user=user, role=role, branch=branch)
        try:
            assignment.save()
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        except IntegrityError as exc:
            raise DRFValidationError({"role": "This role is already assigned."}) from exc
        _audit(request, assignment, "accounts.UserRole", "operator.role_assigned")
        return Response({"id": str(assignment.id)}, status=201)


class OperatorClinicDetailView(APIView):
    permission_classes = [OperatorPermission]

    def get(self, request, clinic_id, **kwargs):
        clinic = get_object_or_404(Clinic, pk=clinic_id)
        return Response(
            {
                "id": str(clinic.id),
                "name": clinic.name,
                "code": clinic.code,
                "timezone": clinic.timezone,
                "currency": clinic.currency,
                "is_active": clinic.is_active,
            }
        )

    def patch(self, request, clinic_id, **kwargs):
        clinic = get_object_or_404(Clinic, pk=clinic_id)
        for field in ("name", "timezone", "currency"):
            if field in request.data:
                setattr(clinic, field, request.data[field] or "")
        if "is_active" in request.data:
            clinic.is_active = bool(request.data["is_active"])
        try:
            clinic.save()
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        _audit(request, clinic, "clinics.Clinic", "operator.clinic_updated", result="updated")
        return Response(
            {
                "id": str(clinic.id),
                "name": clinic.name,
                "code": clinic.code,
                "timezone": clinic.timezone,
                "currency": clinic.currency,
                "is_active": clinic.is_active,
            }
        )

    def delete(self, request, clinic_id, **kwargs):
        clinic = get_object_or_404(Clinic, pk=clinic_id)
        if Branch.objects.filter(clinic=clinic).exists():
            raise DRFValidationError({"clinic": "Remove branches before deleting this clinic."})
        if Role.objects.filter(clinic=clinic).exists():
            raise DRFValidationError({"clinic": "Remove roles before deleting this clinic."})
        if User.objects.filter(clinic=clinic).exists():
            raise DRFValidationError({"clinic": "Remove staff users before deleting this clinic."})
        if Patient.objects.filter(clinic=clinic).exists():
            raise DRFValidationError({"clinic": "This clinic has patient records and cannot be deleted."})
        _audit(request, clinic, "clinics.Clinic", "operator.clinic_deleted", result="deleted")
        clinic.delete()
        return Response(status=204)


class OperatorBranchDetailView(APIView):
    permission_classes = [OperatorPermission]

    def patch(self, request, branch_id, **kwargs):
        branch = get_object_or_404(Branch, pk=branch_id)
        if "name" in request.data:
            branch.name = request.data["name"] or ""
        if "is_active" in request.data:
            branch.is_active = bool(request.data["is_active"])
        try:
            branch.save()
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        _audit(request, branch, "clinics.Branch", "operator.branch_updated", result="updated")
        return Response(
            {
                "id": str(branch.id),
                "clinic": str(branch.clinic_id),
                "name": branch.name,
                "code": branch.code,
                "is_active": branch.is_active,
            }
        )


class OperatorRoleDetailView(APIView):
    permission_classes = [OperatorPermission]

    def get(self, request, role_id, **kwargs):
        role = get_object_or_404(Role.objects.prefetch_related("permissions"), pk=role_id)
        return Response(
            {
                "id": str(role.id),
                "clinic": str(role.clinic_id),
                "name": role.name,
                "code": role.code,
                "permissions": sorted(item.code for item in role.permissions.all()),
            }
        )

    def patch(self, request, role_id, **kwargs):
        role = get_object_or_404(Role.objects.prefetch_related("permissions"), pk=role_id)
        if "name" in request.data:
            role.name = request.data["name"] or ""
        codes = request.data.get("permissions")
        if codes is not None:
            if not isinstance(codes, list) or not codes:
                raise DRFValidationError({"permissions": "Choose at least one module permission."})
            found = list(Permission.objects.filter(code__in=codes))
            if len(found) != len(set(codes)):
                raise DRFValidationError({"permissions": "Install module access before updating a role."})
            role.permissions.set(found)
        try:
            role.save()
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        _audit(request, role, "accounts.Role", "operator.role_updated", result="updated")
        return Response(
            {
                "id": str(role.id),
                "clinic": str(role.clinic_id),
                "name": role.name,
                "code": role.code,
                "permissions": sorted(item.code for item in role.permissions.all()),
            }
        )

    def delete(self, request, role_id, **kwargs):
        role = get_object_or_404(Role, pk=role_id)
        if UserRole.objects.filter(role=role).exists():
            raise DRFValidationError({"role": "Remove role assignments before deleting this role."})
        _audit(request, role, "accounts.Role", "operator.role_deleted", result="deleted")
        role.delete()
        return Response(status=204)


class OperatorUserDetailView(APIView):
    permission_classes = [OperatorPermission]

    def patch(self, request, user_id, **kwargs):
        user = get_object_or_404(User, pk=user_id)
        if "full_name" in request.data:
            user.full_name = request.data["full_name"] or ""
        if "is_active" in request.data:
            if user.is_superuser and not bool(request.data["is_active"]):
                raise DRFValidationError({"is_active": "Operator accounts cannot be deactivated here."})
            user.is_active = bool(request.data["is_active"])
        try:
            user.save()
        except DjangoValidationError as exc:
            raise _validation(exc) from exc
        _audit(request, user, "accounts.User", "operator.user_updated", result="updated")
        return Response(
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "clinic_id": str(user.clinic_id) if user.clinic_id else None,
                "is_active": user.is_active,
                "is_superuser": user.is_superuser,
            }
        )


class OperatorAssignmentDetailView(APIView):
    permission_classes = [OperatorPermission]

    def delete(self, request, assignment_id, **kwargs):
        assignment = get_object_or_404(UserRole.objects.select_related("user", "role", "branch"), pk=assignment_id)
        _audit(request, assignment, "accounts.UserRole", "operator.role_unassigned", result="deleted")
        assignment.delete()
        return Response(status=204)
