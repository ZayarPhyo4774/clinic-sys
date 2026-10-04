from django.db import models
from django.utils import timezone
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.admin_views import _require_clinic
from apps.accounts.permissions import BranchScopedPermission, extract_branch_id
from apps.notifications.models import Notification
from apps.patients.pagination import PatientPagination


class NotificationListView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "notifications.view"

    def get(self, request, **kwargs):
        clinic_id = _require_clinic(request.user)
        queryset = Notification.objects.filter(clinic_id=clinic_id, recipient=request.user).order_by("-created_at")
        branch_id = extract_branch_id(request)
        if branch_id is not None:
            queryset = queryset.filter(models.Q(branch_id=branch_id) | models.Q(branch__isnull=True))
        unread = request.query_params.get("unread")
        if unread in {"true", "1"}:
            queryset = queryset.filter(read_at__isnull=True)

        paginator = PatientPagination()
        page = paginator.paginate_queryset(queryset, request, view=self)
        results = [_serialize(row) for row in page]
        return paginator.get_paginated_response(results)


class NotificationDetailView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "notifications.view"

    def patch(self, request, notification_id, **kwargs):
        clinic_id = _require_clinic(request.user)
        notification = Notification.objects.filter(
            pk=notification_id,
            clinic_id=clinic_id,
            recipient=request.user,
        ).first()
        if notification is None:
            from rest_framework.exceptions import NotFound

            raise NotFound()
        if "read" in request.data:
            if bool(request.data["read"]):
                notification.read_at = notification.read_at or timezone.now()
            else:
                notification.read_at = None
            notification.save(update_fields=["read_at"])
        return Response(_serialize(notification))


def _serialize(row: Notification) -> dict:
    return {
        "id": str(row.id),
        "title": row.title,
        "message": row.message,
        "kind": row.kind,
        "read_at": row.read_at.isoformat() if row.read_at else None,
        "created_at": row.created_at.isoformat(),
        "branch_id": str(row.branch_id) if row.branch_id else None,
    }
