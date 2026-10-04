import uuid

from django.db.models import Q

from apps.accounts.models import Permission, UserRole
from apps.clinics.models import Branch

CLINIC_ADMIN_PERMISSIONS = frozenset(
    {
        "users.manage",
        "roles.manage",
        "reports.view",
        "audit.view",
        "notifications.view",
    }
)


def permissions_for_user(user, branch_id: uuid.UUID | None) -> set[str]:
    if not getattr(user, "is_authenticated", False):
        return set()
    if user.is_superuser:
        return set(Permission.objects.values_list("code", flat=True))
    if user.clinic_id is None:
        return set()

    assignments = UserRole.objects.filter(user=user, role__clinic_id=user.clinic_id)
    if branch_id is None:
        assignments = assignments.filter(branch__isnull=True)
    else:
        assignments = assignments.filter(Q(branch__isnull=True) | Q(branch_id=branch_id))

    codes = set(assignments.values_list("role__permissions__code", flat=True))
    codes.discard(None)
    return codes


def clinic_permissions_for_user(user) -> set[str]:
    """Permission codes granted by any role assignment in the user's clinic."""
    if not getattr(user, "is_authenticated", False) or user.is_superuser:
        return set()
    if user.clinic_id is None:
        return set()

    codes = set(
        UserRole.objects.filter(user=user, role__clinic_id=user.clinic_id).values_list(
            "role__permissions__code",
            flat=True,
        )
    )
    codes.discard(None)
    return codes


def active_permissions_for_user(user, branch_id: uuid.UUID | None) -> set[str]:
    """Operational permissions for the active branch plus clinic-admin permissions."""
    if user.is_superuser:
        return set(Permission.objects.values_list("code", flat=True))
    effective = effective_branch_id(user, branch_id)
    codes = permissions_for_user(user, effective)
    codes |= clinic_permissions_for_user(user) & CLINIC_ADMIN_PERMISSIONS
    return codes


def has_clinic_admin_permission(user, code: str) -> bool:
    return code in CLINIC_ADMIN_PERMISSIONS and code in clinic_permissions_for_user(user)


def has_role_assignments(user) -> bool:
    if not user.clinic_id:
        return False
    return UserRole.objects.filter(user=user, role__clinic_id=user.clinic_id).exists()


def assigned_branches_for_user(user):
    if not user.clinic_id:
        return Branch.objects.none()
    branch_ids = (
        UserRole.objects.filter(user=user, role__clinic_id=user.clinic_id, branch_id__isnull=False)
        .values_list("branch_id", flat=True)
        .distinct()
    )
    return Branch.objects.filter(id__in=branch_ids, clinic_id=user.clinic_id, is_active=True).order_by("name")


def effective_branch_id(user, branch_id: uuid.UUID | None) -> uuid.UUID | None:
    """Resolve the branch context used for permission checks.

    When a user is assigned to exactly one branch, that branch is implied even
    without an X-Branch-Id header so branch-scoped staff can sign in normally.
    """
    assigned = list(assigned_branches_for_user(user))
    assigned_ids = {row.id for row in assigned}

    if branch_id is not None:
        if not assigned_ids or branch_id in assigned_ids:
            return branch_id
        if len(assigned) == 1:
            return assigned[0].id
        return branch_id

    if len(assigned) == 1:
        return assigned[0].id
    return None


def requires_branch_selection(user, branch_id: uuid.UUID | None) -> bool:
    """True when the user must pick among multiple branch-scoped assignments."""
    if user.is_superuser or not user.clinic_id:
        return False
    effective = effective_branch_id(user, branch_id)
    if permissions_for_user(user, effective):
        return False
    return assigned_branches_for_user(user).count() > 1


def access_block_reason(user, branch_id: uuid.UUID | None) -> str | None:
    if user.is_superuser or active_permissions_for_user(user, branch_id):
        return None
    if not has_role_assignments(user):
        return "no_role"
    if assigned_branches_for_user(user).exists():
        return "branch_required"
    roles_with_permissions = (
        UserRole.objects.filter(user=user, role__clinic_id=user.clinic_id, role__permissions__isnull=False)
        .distinct()
        .exists()
    )
    if not roles_with_permissions:
        return "role_empty"
    return None
