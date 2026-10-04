import uuid

from rest_framework.exceptions import PermissionDenied
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.permissions import BasePermission

from apps.accounts.services import (
    CLINIC_ADMIN_PERMISSIONS,
    clinic_permissions_for_user,
    effective_branch_id,
    permissions_for_user,
)
from apps.clinics.models import Branch


def extract_branch_id(request) -> uuid.UUID | None:
    raw = request.headers.get("X-Branch-Id", "").strip()
    if not raw:
        return None
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise DRFValidationError({"X-Branch-Id": "Must be a UUID."}) from exc


class BranchScopedPermission(BasePermission):
    """Enforces an optional view.required_permission inside the active branch.

    A missing permission code allows any authenticated user through.
    Views that only need authentication still use this class so a foreign
    branch header is rejected.
    """

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True

        branch_id = extract_branch_id(request)
        if branch_id is not None and not Branch.objects.filter(
            id=branch_id,
            clinic_id=user.clinic_id,
            is_active=True,
        ).exists():
            raise PermissionDenied(detail="Branch is not authorized.")

        required = getattr(view, "required_permission", None)
        if not required:
            return True
        if required in CLINIC_ADMIN_PERMISSIONS:
            return required in clinic_permissions_for_user(user)
        effective = effective_branch_id(user, branch_id)
        return required in permissions_for_user(user, effective)
