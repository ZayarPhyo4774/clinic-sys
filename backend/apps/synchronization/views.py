from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import BranchScopedPermission, extract_branch_id
from apps.audit.services import client_ip
from apps.synchronization.serializers import SyncPushSerializer
from apps.synchronization.services import changes_after, push_batch, status_for


class SyncPushView(APIView):
    permission_classes = [BranchScopedPermission]

    def post(self, request, **kwargs):
        serializer = SyncPushSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        results = push_batch(
            serializer.validated_data["operations"],
            user=request.user,
            ip_address=client_ip(request),
        )
        return Response({"results": results})


class SyncPullView(APIView):
    permission_classes = [BranchScopedPermission]

    def get(self, request, **kwargs):
        raw = request.query_params.get("cursor", "0")
        try:
            cursor = int(raw)
        except (TypeError, ValueError) as exc:
            raise ValidationError({"cursor": "Use an integer cursor."}) from exc
        if cursor < 0:
            raise ValidationError({"cursor": "Use an integer cursor."})
        return Response(changes_after(request.user, cursor=cursor, branch_id=extract_branch_id(request)))


class SyncStatusView(APIView):
    permission_classes = [BranchScopedPermission]

    def get(self, request, **kwargs):
        device_id = request.query_params.get("device_id", "").strip()
        if len(device_id) > 64:
            raise ValidationError({"device_id": "Device id is too long."})
        return Response(status_for(request.user, device_id=device_id))
