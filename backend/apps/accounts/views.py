from rest_framework.exceptions import AuthenticationFailed
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from apps.accounts.permissions import BranchScopedPermission, extract_branch_id
from apps.accounts.services import (
    access_block_reason,
    active_permissions_for_user,
    assigned_branches_for_user,
    effective_branch_id,
    has_role_assignments,
    permissions_for_user,
    requires_branch_selection,
)
from apps.accounts.throttles import LoginRateThrottle, RefreshRateThrottle
from apps.audit.services import client_ip, record_audit_event


class EmailTokenObtainPairView(TokenObtainPairView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except AuthenticationFailed:
            record_audit_event(
                action="auth.login_failed",
                entity_type="accounts.User",
                ip_address=client_ip(request),
                metadata={"result": "failure"},
            )
            raise

        user = serializer.user
        record_audit_event(
            actor=user,
            action="auth.login",
            entity_type="accounts.User",
            entity_id=user.id,
            clinic=user.clinic,
            ip_address=client_ip(request),
            metadata={"result": "success"},
        )
        return Response(serializer.validated_data)


class RefreshView(TokenRefreshView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [RefreshRateThrottle]


class MeView(APIView):
    permission_classes = [IsAuthenticated, BranchScopedPermission]

    def get(self, request, **kwargs):
        user = request.user
        requested_branch_id = None if user.is_superuser else extract_branch_id(request)
        resolved_branch_id = None if user.is_superuser else effective_branch_id(user, requested_branch_id)
        assigned = assigned_branches_for_user(user)
        clinic_timezone = None
        if user.clinic_id:
            from apps.clinics.models import Clinic

            clinic_timezone = Clinic.objects.filter(id=user.clinic_id).values_list("timezone", flat=True).first()
        return Response(
            {
                "id": str(user.id),
                "email": user.email,
                "full_name": user.full_name,
                "clinic_id": str(user.clinic_id) if user.clinic_id else None,
                "clinic_timezone": clinic_timezone,
                "is_superuser": bool(user.is_superuser),
                "permissions": sorted(active_permissions_for_user(user, requested_branch_id)),
                "has_role_assignments": has_role_assignments(user),
                "requires_branch_selection": requires_branch_selection(user, requested_branch_id),
                "access_block_reason": access_block_reason(user, requested_branch_id),
                "resolved_branch_id": str(resolved_branch_id) if resolved_branch_id else None,
                "assigned_branches": [
                    {"id": str(row.id), "name": row.name, "code": row.code} for row in assigned
                ],
            }
        )
