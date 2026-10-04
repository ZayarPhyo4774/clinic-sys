from apps.accounts.permissions import BranchScopedPermission


class PharmacyPermission(BranchScopedPermission):
    def has_permission(self, request, view) -> bool:
        raw = getattr(view, "permission_map", {}).get(getattr(view, "action", None))
        if not raw:
            return False
        view.required_permission = raw
        return super().has_permission(request, view)
