from apps.accounts.permissions import BranchScopedPermission


class PrescriptionPermission(BranchScopedPermission):
    def has_permission(self, request, view) -> bool:
        raw = getattr(view, "permission_map", {}).get(getattr(view, "action", None))
        if not raw:
            return False
        codes = (raw,) if isinstance(raw, str) else tuple(raw)
        for code in codes:
            view.required_permission = code
            if super().has_permission(request, view):
                return True
        return False
