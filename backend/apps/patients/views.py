from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from apps.audit.services import client_ip, record_audit_event
from apps.clinics.scoping import apply_clinic_scope, header_branch_id, parse_bool, parse_uuid
from apps.patients.models import (
    Patient,
    PatientAddress,
    PatientAllergy,
    PatientContact,
    PatientDocument,
    PatientMedicalHistory,
)
from apps.patients.pagination import PatientPagination
from apps.patients.permissions import PatientPermission
from apps.patients.serializers import (
    PatientAddressSerializer,
    PatientAllergySerializer,
    PatientContactSerializer,
    PatientDocumentSerializer,
    PatientMedicalHistorySerializer,
    PatientSerializer,
)


def visible_patients(request):
    queryset = Patient.objects.select_related("clinic", "branch", "created_by")
    queryset = apply_clinic_scope(queryset, request.user, "clinic_id")
    header_branch = header_branch_id(request)
    if header_branch is not None:
        queryset = queryset.filter(branch_id=header_branch)
    return queryset


class PatientViewSet(viewsets.ModelViewSet):
    serializer_class = PatientSerializer
    permission_classes = [PatientPermission]
    pagination_class = PatientPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["patient_number", "full_name"]
    ordering_fields = ["patient_number", "full_name", "created_at"]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]
    permission_map = {
        "list": "patients.view",
        "retrieve": "patients.view",
        "profile": "patients.view",
        "create": "patients.create",
        "update": "patients.update",
        "partial_update": "patients.update",
        "destroy": "patients.delete",
    }

    def get_queryset(self):
        queryset = visible_patients(self.request)
        if self.action != "list":
            return queryset
        query_branch = parse_uuid(self.request.query_params.get("branch"), "branch")
        header_branch = header_branch_id(self.request)
        if header_branch and query_branch and header_branch != query_branch:
            raise DRFValidationError({"branch": "Must match X-Branch-Id."})
        if query_branch and header_branch is None:
            queryset = queryset.filter(branch_id=query_branch)
        active = parse_bool(self.request.query_params.get("is_active"), "is_active")
        if active is not None:
            queryset = queryset.filter(is_active=active)
        sex = self.request.query_params.get("sex", "")
        if sex:
            if sex not in Patient.Sex.values:
                raise DRFValidationError({"sex": "Must be female, male, other, or unknown."})
            queryset = queryset.filter(sex=sex)
        dob = self.request.query_params.get("date_of_birth", "")
        if dob:
            from datetime import date

            try:
                parsed = date.fromisoformat(dob)
            except ValueError as exc:
                raise DRFValidationError({"date_of_birth": "Use YYYY-MM-DD."}) from exc
            queryset = queryset.filter(date_of_birth=parsed)
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def perform_create(self, serializer):
        patient = _save(serializer, created_by=self.request.user)
        _audit(self.request, patient, "patients.Patient", "patients.patient_created", patient.clinic, patient.branch)

    def perform_update(self, serializer):
        patient = _save(serializer)
        _audit(self.request, patient, "patients.Patient", "patients.patient_updated", patient.clinic, patient.branch)

    def destroy(self, request, *args, **kwargs):
        patient = self.get_object()
        if patient.is_active:
            patient.is_active = False
            patient.version += 1
            patient.save(update_fields=["is_active", "version", "updated_at"])
            _audit(request, patient, "patients.Patient", "patients.patient_deactivated", patient.clinic, patient.branch)
        return Response(PatientSerializer(patient, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def profile(self, request, pk=None, **kwargs):
        patient = self.get_object()
        return Response(
            {
                "patient": PatientSerializer(patient, context={"request": request}).data,
                "contacts": PatientContactSerializer(patient.contacts.all(), many=True).data,
                "addresses": PatientAddressSerializer(patient.addresses.all(), many=True).data,
                "allergies": PatientAllergySerializer(patient.allergies.all(), many=True).data,
                "medical_history": PatientMedicalHistorySerializer(
                    patient.medical_histories.all(),
                    many=True,
                ).data,
                "documents": PatientDocumentSerializer(patient.documents.all(), many=True).data,
            }
        )


class PatientChildViewSet(viewsets.ModelViewSet):
    permission_classes = [PatientPermission]
    pagination_class = PatientPagination
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    permission_map = {
        "list": "patients.view",
        "retrieve": "patients.view",
        "create": ("patients.create", "patients.update"),
        "update": "patients.update",
        "partial_update": "patients.update",
    }

    def get_patient(self):
        if not hasattr(self, "_patient"):
            self._patient = get_object_or_404(visible_patients(self.request), pk=self.kwargs["patient_id"])
        return self._patient

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["patient"] = self.get_patient()
        return context

    def get_queryset(self):
        return self.queryset.filter(patient=self.get_patient())

    def perform_create(self, serializer):
        patient = self.get_patient()
        instance = _save(
            serializer,
            patient=patient,
            clinic=patient.clinic,
            branch=patient.branch,
            created_by=self.request.user,
        )
        _audit(
            self.request,
            instance,
            self.audit_entity,
            self.audit_created,
            patient.clinic,
            patient.branch,
        )

    def perform_update(self, serializer):
        instance = _save(serializer)
        patient = self.get_patient()
        _audit(
            self.request,
            instance,
            self.audit_entity,
            self.audit_updated,
            patient.clinic,
            patient.branch,
        )


class PatientContactViewSet(PatientChildViewSet):
    queryset = PatientContact.objects.all()
    serializer_class = PatientContactSerializer
    audit_entity = "patients.PatientContact"
    audit_created = "patients.contact_created"
    audit_updated = "patients.contact_updated"


class PatientAddressViewSet(PatientChildViewSet):
    queryset = PatientAddress.objects.all()
    serializer_class = PatientAddressSerializer
    audit_entity = "patients.PatientAddress"
    audit_created = "patients.address_created"
    audit_updated = "patients.address_updated"


class PatientAllergyViewSet(PatientChildViewSet):
    queryset = PatientAllergy.objects.all()
    serializer_class = PatientAllergySerializer
    http_method_names = ["get", "post", "head", "options"]
    audit_entity = "patients.PatientAllergy"
    audit_created = "patients.allergy_created"
    audit_updated = "patients.allergy_updated"


class PatientMedicalHistoryViewSet(PatientChildViewSet):
    queryset = PatientMedicalHistory.objects.all()
    serializer_class = PatientMedicalHistorySerializer
    http_method_names = ["get", "post", "head", "options"]
    audit_entity = "patients.PatientMedicalHistory"
    audit_created = "patients.history_created"
    audit_updated = "patients.history_updated"


class PatientDocumentViewSet(PatientChildViewSet):
    queryset = PatientDocument.objects.all()
    serializer_class = PatientDocumentSerializer
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    audit_entity = "patients.PatientDocument"
    audit_created = "patients.document_created"
    audit_updated = "patients.document_updated"


def _save(serializer, **kwargs):
    try:
        return serializer.save(**kwargs)
    except DjangoValidationError as exc:
        if getattr(exc, "message_dict", None):
            raise DRFValidationError(exc.message_dict) from exc
        raise DRFValidationError(exc.messages) from exc


def _audit(request, instance, entity_type, action, clinic, branch):
    record_audit_event(
        actor=request.user,
        action=action,
        entity_type=entity_type,
        entity_id=instance.id,
        clinic=clinic,
        branch=branch,
        ip_address=client_ip(request),
        metadata={"result": action.rsplit("_", 1)[-1]},
    )
