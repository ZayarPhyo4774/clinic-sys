from apps.accounts.permissions import BranchScopedPermission

_READ_ACTIONS = frozenset({"list", "retrieve"})


class OrganizationPermission(BranchScopedPermission):
    """Maps a viewset action to one application permission code."""

    def has_permission(self, request, view) -> bool:
        code = getattr(view, "permission_map", {}).get(getattr(view, "action", None))
        if not code:
            return False
        view.required_permission = code
        return super().has_permission(request, view)


_APPOINTMENT_READ_ALTERNATES = (
    "appointments.view",
    "appointments.create",
    "appointments.update",
)


class _ReadAlternatePermission(OrganizationPermission):
    read_alternate_permissions: tuple[str, ...] = ()

    def has_permission(self, request, view) -> bool:
        action = getattr(view, "action", None)
        if action not in _READ_ACTIONS:
            return super().has_permission(request, view)

        permission_map = getattr(view, "permission_map", {})
        primary = permission_map.get(action)
        if not primary:
            return False

        for code in (primary, *self.read_alternate_permissions):
            view.required_permission = code
            if super().has_permission(request, view):
                return True
        return False


class DoctorProfilePermission(_ReadAlternatePermission):
    """Allow appointment workflows to list doctors without full staff admin access."""

    read_alternate_permissions = _APPOINTMENT_READ_ALTERNATES + (
        "encounters.view",
        "prescriptions.view",
        "billing.view",
        "billing.create",
        "laboratory.manage",
    )


class StaffReadPermission(_ReadAlternatePermission):
    """Allow scheduling screens to resolve staff names without staff admin access."""

    read_alternate_permissions = _APPOINTMENT_READ_ALTERNATES + ("encounters.view",)
