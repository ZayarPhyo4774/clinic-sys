from rest_framework.exceptions import PermissionDenied

from apps.accounts.permissions import BranchScopedPermission


class SchedulingPermission(BranchScopedPermission):
    """Checks one or more permission codes for the current view action."""

    def has_permission(self, request, view) -> bool:
        action = getattr(view, "action", None)
        raw = getattr(view, "permission_map", {}).get(action)
        if not raw:
            return False
        codes = (raw,) if isinstance(raw, str) else tuple(raw)
        require_all = getattr(view, "permission_requires_all", frozenset())
        if action in require_all:
            missing = []
            for code in codes:
                view.required_permission = code
                if not super().has_permission(request, view):
                    missing.append(code)
            if missing:
                raise PermissionDenied(
                    detail=(
                        f"Walk-in requires {' and '.join(codes)} at the selected branch. "
                        f"Missing: {', '.join(missing)}."
                    )
                )
            return True
        for code in codes:
            view.required_permission = code
            if super().has_permission(request, view):
                return True
        return False
