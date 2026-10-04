from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from apps.audit.services import client_ip, record_audit_event
from apps.clinics.scoping import apply_clinic_scope, header_branch_id, parse_uuid
from apps.prescriptions.models import Prescription, PrescriptionItem
from apps.prescriptions.pagination import PrescriptionPagination
from apps.prescriptions.permissions import PrescriptionPermission
from apps.prescriptions.serializers import DispenseSerializer, PrescriptionItemSerializer, PrescriptionSerializer
from apps.prescriptions.services import cancel_prescription, dispense_item


def visible_prescriptions(request):
    queryset = Prescription.objects.select_related(
        "clinic",
        "branch",
        "patient",
        "doctor",
        "doctor__staff",
        "doctor__staff__user",
        "encounter",
    )
    queryset = apply_clinic_scope(queryset, request.user, "clinic_id")
    header = header_branch_id(request)
    if header is not None:
        queryset = queryset.filter(branch_id=header)
    return queryset


def run_service(func):
    try:
        return func()
    except DjangoValidationError as exc:
        if getattr(exc, "error_dict", None):
            raise DRFValidationError(exc.message_dict) from exc
        raise DRFValidationError(exc.messages) from exc


def audit(request, instance, entity_type, action, result):
    record_audit_event(
        actor=request.user,
        action=action,
        entity_type=entity_type,
        entity_id=instance.id,
        clinic=instance.clinic,
        branch=getattr(instance, "branch", None),
        ip_address=client_ip(request),
        metadata={"result": result},
    )


class PrescriptionViewSet(viewsets.ModelViewSet):
    serializer_class = PrescriptionSerializer
    permission_classes = [PrescriptionPermission]
    pagination_class = PrescriptionPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["patient__patient_number", "patient__full_name"]
    ordering_fields = ["created_at", "status"]
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "prescriptions.view",
        "retrieve": "prescriptions.view",
        "create": "prescriptions.create",
        "cancel": "prescriptions.create",
    }

    def get_queryset(self):
        queryset = visible_prescriptions(self.request)
        if self.action != "list":
            return queryset
        query_branch = parse_uuid(self.request.query_params.get("branch"), "branch")
        header = header_branch_id(self.request)
        if header and query_branch and header != query_branch:
            raise DRFValidationError({"branch": "Must match X-Branch-Id."})
        if query_branch and header is None:
            queryset = queryset.filter(branch_id=query_branch)
        patient = parse_uuid(self.request.query_params.get("patient"), "patient")
        if patient is not None:
            queryset = queryset.filter(patient_id=patient)
        doctor = parse_uuid(self.request.query_params.get("doctor"), "doctor")
        if doctor is not None:
            queryset = queryset.filter(doctor_id=doctor)
        status = self.request.query_params.get("status", "")
        if status:
            if status not in Prescription.Status.values:
                raise DRFValidationError({"status": "Unknown prescription status."})
            queryset = queryset.filter(status=status)
        encounter = parse_uuid(self.request.query_params.get("encounter"), "encounter")
        if encounter is not None:
            queryset = queryset.filter(encounter_id=encounter)
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def perform_create(self, serializer):
        prescription = run_service(lambda: serializer.save(created_by=self.request.user))
        audit(self.request, prescription, "prescriptions.Prescription", "prescriptions.prescription_created", "created")
        return prescription

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        prescription = self.perform_create(serializer)
        return Response(self.get_serializer(prescription).data, status=201)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None, **kwargs):
        prescription = self.get_object()
        prescription = run_service(lambda: cancel_prescription(prescription.pk))
        audit(request, prescription, "prescriptions.Prescription", "prescriptions.prescription_cancelled", "cancelled")
        return Response(self.get_serializer(prescription).data)


class PrescriptionItemViewSet(viewsets.ModelViewSet):
    queryset = PrescriptionItem.objects.all()
    serializer_class = PrescriptionItemSerializer
    permission_classes = [PrescriptionPermission]
    pagination_class = PrescriptionPagination
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "prescriptions.view",
        "retrieve": "prescriptions.view",
        "create": "prescriptions.create",
        "dispense": "pharmacy.manage",
    }

    def get_prescription(self):
        if not hasattr(self, "_prescription"):
            self._prescription = get_object_or_404(
                visible_prescriptions(self.request),
                pk=self.kwargs["prescription_id"],
            )
        return self._prescription

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action != "dispense":
            context["prescription"] = self.get_prescription()
        return context

    def get_queryset(self):
        return self.queryset.filter(prescription=self.get_prescription())

    def perform_create(self, serializer):
        item = run_service(
            lambda: serializer.save(prescription=self.get_prescription(), created_by=self.request.user)
        )
        audit(self.request, item, "prescriptions.PrescriptionItem", "prescriptions.item_created", "created")
        return item

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = self.perform_create(serializer)
        return Response(self.get_serializer(item).data, status=201)

    def dispense(self, request, prescription_id=None, pk=None, **kwargs):
        item = self.get_object()
        incoming = DispenseSerializer(data=request.data, context={"request": request, "item": item})
        incoming.is_valid(raise_exception=True)
        entry = run_service(
            lambda: dispense_item(
                item_id=item.pk,
                batch_id=incoming.validated_data["batch"].pk,
                quantity=incoming.validated_data["quantity"],
                user=request.user,
            )
        )
        entry.batch.refresh_from_db()
        item.refresh_from_db()
        item.prescription.refresh_from_db()
        audit(request, entry, "pharmacy.StockTransaction", "pharmacy.dispensed", "dispensed")
        return Response(
            {
                "transaction_id": str(entry.id),
                "quantity_dispensed": item.quantity_dispensed,
                "prescription_status": item.prescription.status,
                "quantity_on_hand": entry.batch.quantity_on_hand,
            }
        )
