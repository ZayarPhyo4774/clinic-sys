from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models.functions import TruncDate
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from zoneinfo import ZoneInfo

from apps.accounts.permissions import BranchScopedPermission
from apps.audit.services import client_ip, record_audit_event
from apps.clinics.scoping import apply_clinic_scope, header_branch_id, parse_uuid
from apps.encounters.models import (
    ClinicalNote,
    Diagnosis,
    Encounter,
    FollowUp,
    Symptom,
    TreatmentPlan,
    VitalSign,
)
from apps.encounters.pagination import EncounterPagination
from apps.encounters.permissions import EncounterPermission
from apps.encounters.serializers import (
    ClinicalNoteSerializer,
    DiagnosisSerializer,
    EncounterSerializer,
    FollowUpSerializer,
    SymptomSerializer,
    TreatmentPlanSerializer,
    VitalSignSerializer,
)
from apps.encounters.services import complete_encounter
from apps.encounters.vital_units import vital_units_payload


def visible_encounters(request):
    queryset = Encounter.objects.select_related(
        "clinic",
        "branch",
        "patient",
        "doctor",
        "doctor__staff",
        "doctor__staff__user",
        "appointment",
        "started_by",
        "completed_by",
    )
    queryset = apply_clinic_scope(queryset, request.user, "clinic_id")
    header_branch = header_branch_id(request)
    if header_branch is not None:
        queryset = queryset.filter(branch_id=header_branch)
    return queryset


def run_service(func):
    try:
        return func()
    except DjangoValidationError as exc:
        if getattr(exc, "error_dict", None):
            raise DRFValidationError(exc.message_dict) from exc
        raise DRFValidationError(exc.messages) from exc
    except IntegrityError as exc:
        raise DRFValidationError({"appointment": "An encounter already exists for this appointment."}) from exc


def audit(request, instance, entity_type, action, result):
    record_audit_event(
        actor=request.user,
        action=action,
        entity_type=entity_type,
        entity_id=instance.id,
        clinic=instance.clinic,
        branch=instance.branch,
        ip_address=client_ip(request),
        metadata={"result": result},
    )


class EncounterViewSet(viewsets.ModelViewSet):
    serializer_class = EncounterSerializer
    permission_classes = [EncounterPermission]
    pagination_class = EncounterPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["patient__patient_number", "patient__full_name"]
    ordering_fields = ["started_at", "created_at"]
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "encounters.view",
        "retrieve": "encounters.view",
        "history": "encounters.view",
        "create": "encounters.create",
        "complete": "encounters.update",
    }

    def get_queryset(self):
        queryset = visible_encounters(self.request)
        if self.action != "list":
            return queryset
        query_branch = parse_uuid(self.request.query_params.get("branch"), "branch")
        header_branch = header_branch_id(self.request)
        if header_branch and query_branch and header_branch != query_branch:
            raise DRFValidationError({"branch": "Must match X-Branch-Id."})
        if query_branch and header_branch is None:
            queryset = queryset.filter(branch_id=query_branch)
        patient = parse_uuid(self.request.query_params.get("patient"), "patient")
        if patient is not None:
            queryset = queryset.filter(patient_id=patient)
        appointment = parse_uuid(self.request.query_params.get("appointment"), "appointment")
        if appointment is not None:
            queryset = queryset.filter(appointment_id=appointment)
        doctor = parse_uuid(self.request.query_params.get("doctor"), "doctor")
        if doctor is not None:
            queryset = queryset.filter(doctor_id=doctor)
        status = self.request.query_params.get("status", "")
        if status:
            if status not in Encounter.Status.values:
                raise DRFValidationError({"status": "Unknown encounter status."})
            queryset = queryset.filter(status=status)
        raw_date = self.request.query_params.get("date", "")
        if raw_date:
            try:
                parsed = date.fromisoformat(raw_date)
            except ValueError as exc:
                raise DRFValidationError({"date": "Use YYYY-MM-DD."}) from exc
            clinic = getattr(self.request.user, "clinic", None)
            zone = ZoneInfo(clinic.timezone) if clinic is not None else ZoneInfo("UTC")
            queryset = queryset.annotate(local_date=TruncDate("started_at", tzinfo=zone)).filter(local_date=parsed)
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def perform_create(self, serializer):
        encounter = run_service(lambda: serializer.save(started_by=self.request.user))
        audit(self.request, encounter, "encounters.Encounter", "encounters.encounter_started", "started")
        return encounter

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        encounter = self.perform_create(serializer)
        output = EncounterSerializer(encounter, context={"request": request})
        return Response(output.data, status=201)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None, **kwargs):
        encounter = self.get_object()
        encounter = run_service(lambda: complete_encounter(encounter.pk, request.user))
        audit(request, encounter, "encounters.Encounter", "encounters.encounter_completed", "completed")
        return Response(EncounterSerializer(encounter, context={"request": request}).data)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None, **kwargs):
        encounter = self.get_object()
        return Response(
            {
                "encounter": EncounterSerializer(encounter, context={"request": request}).data,
                "vitals": VitalSignSerializer(encounter.vitalsign_entries.all(), many=True).data,
                "symptoms": SymptomSerializer(encounter.symptom_entries.all(), many=True).data,
                "diagnoses": DiagnosisSerializer(encounter.diagnosis_entries.all(), many=True).data,
                "notes": ClinicalNoteSerializer(encounter.clinicalnote_entries.all(), many=True).data,
                "treatment_plans": TreatmentPlanSerializer(encounter.treatmentplan_entries.all(), many=True).data,
                "follow_ups": FollowUpSerializer(encounter.followup_entries.all(), many=True).data,
            }
        )


class EncounterChildViewSet(viewsets.ModelViewSet):
    permission_classes = [EncounterPermission]
    pagination_class = EncounterPagination
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "encounters.view",
        "retrieve": "encounters.view",
        "create": "encounters.create",
    }
    audit_entity = ""
    audit_action = ""

    def get_encounter(self):
        if not hasattr(self, "_encounter"):
            self._encounter = get_object_or_404(visible_encounters(self.request), pk=self.kwargs["encounter_id"])
        return self._encounter

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["encounter"] = self.get_encounter()
        return context

    def get_queryset(self):
        return self.queryset.filter(encounter=self.get_encounter())

    def perform_create(self, serializer):
        row = run_service(
            lambda: serializer.save(encounter=self.get_encounter(), recorded_by=self.request.user)
        )
        result = "corrected" if row.supersedes_id else "created"
        audit(self.request, row, self.audit_entity, self.audit_action, result)


class VitalSignViewSet(EncounterChildViewSet):
    queryset = VitalSign.objects.all()
    serializer_class = VitalSignSerializer
    audit_entity = "encounters.VitalSign"
    audit_action = "encounters.vital_recorded"


class SymptomViewSet(EncounterChildViewSet):
    queryset = Symptom.objects.all()
    serializer_class = SymptomSerializer
    audit_entity = "encounters.Symptom"
    audit_action = "encounters.symptom_recorded"


class DiagnosisViewSet(EncounterChildViewSet):
    queryset = Diagnosis.objects.all()
    serializer_class = DiagnosisSerializer
    audit_entity = "encounters.Diagnosis"
    audit_action = "encounters.diagnosis_recorded"


class ClinicalNoteViewSet(EncounterChildViewSet):
    queryset = ClinicalNote.objects.all()
    serializer_class = ClinicalNoteSerializer
    audit_entity = "encounters.ClinicalNote"
    audit_action = "encounters.note_recorded"


class TreatmentPlanViewSet(EncounterChildViewSet):
    queryset = TreatmentPlan.objects.all()
    serializer_class = TreatmentPlanSerializer
    audit_entity = "encounters.TreatmentPlan"
    audit_action = "encounters.treatment_plan_recorded"


class FollowUpViewSet(EncounterChildViewSet):
    queryset = FollowUp.objects.all()
    serializer_class = FollowUpSerializer
    audit_entity = "encounters.FollowUp"
    audit_action = "encounters.follow_up_recorded"


class VitalUnitsView(APIView):
    permission_classes = [IsAuthenticated, BranchScopedPermission]
    required_permission = "encounters.view"

    def get(self, request, **kwargs):
        return Response(vital_units_payload())
