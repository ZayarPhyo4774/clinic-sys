from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.permissions import BranchScopedPermission
from apps.clinics.ccr_serializers import ClinicCcrSettingsSerializer, ClinicDisabilityTypeSerializer
from apps.clinics.ccr_services import ensure_ccr_settings, ensure_default_disability_types
from apps.clinics.models import ClinicDisabilityType
from apps.clinics.serializers import save_model, validation_error


class ClinicCcrSettingsView(APIView):
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
        ensure_default_disability_types(request.user.clinic)
        return ensure_ccr_settings(request.user.clinic)

    def get(self, request, **kwargs):
        settings = self._settings(request)
        return Response(ClinicCcrSettingsSerializer(settings).data)

    def patch(self, request, **kwargs):
        settings = self._settings(request)
        serializer = ClinicCcrSettingsSerializer(settings, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            save_model(serializer)
        except DjangoValidationError as exc:
            raise validation_error(exc) from exc
        return Response(ClinicCcrSettingsSerializer(settings).data)


class DisabilityTypeListCreateView(APIView):
    permission_classes = [BranchScopedPermission]

    def get_permissions(self):
        self.required_permission = "encounters.view" if self.request.method == "GET" else "clinics.manage"
        return super().get_permissions()

    def get(self, request, **kwargs):
        if not request.user.clinic_id:
            raise DRFValidationError("User is not assigned to a clinic.")
        ensure_default_disability_types(request.user.clinic)
        rows = ClinicDisabilityType.objects.filter(clinic_id=request.user.clinic_id).order_by("sort_order", "label")
        return Response(ClinicDisabilityTypeSerializer(rows, many=True).data)

    def post(self, request, **kwargs):
        if not request.user.clinic_id:
            raise DRFValidationError("User is not assigned to a clinic.")
        serializer = ClinicDisabilityTypeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            row = save_model(serializer, clinic=request.user.clinic)
        except DjangoValidationError as exc:
            raise validation_error(exc) from exc
        return Response(ClinicDisabilityTypeSerializer(row).data, status=201)


class DisabilityTypeDetailView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "clinics.manage"

    def get_object(self, request, pk):
        if not request.user.clinic_id:
            raise DRFValidationError("User is not assigned to a clinic.")
        return ClinicDisabilityType.objects.get(pk=pk, clinic_id=request.user.clinic_id)

    def patch(self, request, pk, **kwargs):
        row = self.get_object(request, pk)
        serializer = ClinicDisabilityTypeSerializer(row, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        try:
            save_model(serializer)
        except DjangoValidationError as exc:
            raise validation_error(exc) from exc
        return Response(ClinicDisabilityTypeSerializer(row).data)
