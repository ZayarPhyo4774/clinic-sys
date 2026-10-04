from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.admin_views import _require_clinic
from apps.accounts.permissions import BranchScopedPermission
from apps.audit.models import AuditEvent
from apps.patients.pagination import PatientPagination


class AuditEventView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "audit.view"

    def get(self, request, **kwargs):
        clinic_id = _require_clinic(request.user)
        queryset = AuditEvent.objects.filter(clinic_id=clinic_id).select_related("actor").order_by("-created_at")
        branch_filter = (request.query_params.get("branch") or "").strip()
        if branch_filter:
            queryset = queryset.filter(branch_id=branch_filter)
        action = (request.query_params.get("action") or "").strip()
        if action:
            queryset = queryset.filter(action__icontains=action)
        entity_type = (request.query_params.get("entity_type") or "").strip()
        if entity_type:
            queryset = queryset.filter(entity_type__icontains=entity_type)
        search = (request.query_params.get("search") or "").strip()
        if search:
            queryset = queryset.filter(action__icontains=search)

        paginator = PatientPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        results = [
            {
                "id": str(row.id),
                "action": row.action,
                "entity_type": row.entity_type,
                "entity_id": str(row.entity_id) if row.entity_id else None,
                "actor_email": row.actor.email if row.actor_id else None,
                "branch_id": str(row.branch_id) if row.branch_id else None,
                "ip_address": row.ip_address,
                "created_at": row.created_at.isoformat(),
            }
            for row in page
        ]
        return paginator.get_paginated_response(results)
