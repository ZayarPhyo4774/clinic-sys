from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import BranchScopedPermission
from apps.clinics.serializers import save_model, validation_error
from apps.clinics.vital_settings_serializers import ClinicVitalSettingsSerializer
from apps.clinics.vital_settings_services import ensure_vital_settings, vital_settings_payload


class ClinicVitalSettingsView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "clinics.view"

    def get_permissions(self):
        if self.request.method in {"PUT", "PATCH"}:
            self.required_permission = "clinics.manage"
        else:
            self.required_permission = "clinics.view"
        return super().get_permissions()

    def _settings(self, request):
        if not request.user.clinic_id:
            raise DRFValidationError("User is not assigned to a clinic.")
        return ensure_vital_settings(request.user.clinic)

    def get(self, request, **kwargs):
        return Response(vital_settings_payload(request.user.clinic))

    def patch(self, request, **kwargs):
        settings = self._settings(request)
        serializer = ClinicVitalSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            save_model(serializer)
        except DjangoValidationError as exc:
            raise validation_error(exc) from exc
        return Response(vital_settings_payload(request.user.clinic))
