from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from apps.audit.services import client_ip, record_audit_event
from apps.clinics.scoping import apply_clinic_scope, header_branch_id, parse_bool, parse_uuid
from apps.laboratory.models import LabOrder, LabOrderItem, LabResult, LabTest
from apps.laboratory.pagination import LaboratoryPagination
from apps.laboratory.permissions import LaboratoryPermission
from apps.laboratory.serializers import (
    LabOrderItemSerializer,
    LabOrderSerializer,
    LabResultSerializer,
    LabTestSerializer,
)
from apps.laboratory.services import (
    cancel_order,
    collect_sample,
    complete_order,
    generate_report,
    start_processing,
    verify_result,
)


def visible_orders(request):
    queryset = LabOrder.objects.select_related(
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


class LabTestViewSet(viewsets.ModelViewSet):
    serializer_class = LabTestSerializer
    permission_classes = [LaboratoryPermission]
    pagination_class = LaboratoryPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "created_at"]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    permission_map = {
        "list": "laboratory.view",
        "retrieve": "laboratory.view",
        "create": "laboratory.manage",
        "update": "laboratory.manage",
        "partial_update": "laboratory.manage",
    }

    def get_queryset(self):
        queryset = apply_clinic_scope(LabTest.objects.all(), self.request.user, "clinic_id")
        if self.action != "list":
            return queryset
        active = parse_bool(self.request.query_params.get("is_active"), "is_active")
        if active is not None:
            queryset = queryset.filter(is_active=active)
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def perform_create(self, serializer):
        if not self.request.user.clinic_id:
            raise DRFValidationError("User is not assigned to a clinic.")
        lab_test = run_service(lambda: serializer.save(clinic=self.request.user.clinic, created_by=self.request.user))
        audit(self.request, lab_test, "laboratory.LabTest", "laboratory.test_created", "created")
        return lab_test

    def perform_update(self, serializer):
        lab_test = run_service(serializer.save)
        audit(self.request, lab_test, "laboratory.LabTest", "laboratory.test_updated", "updated")
        return lab_test

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lab_test = self.perform_create(serializer)
        return Response(self.get_serializer(lab_test).data, status=201)


class LabOrderViewSet(viewsets.ModelViewSet):
    serializer_class = LabOrderSerializer
    permission_classes = [LaboratoryPermission]
    pagination_class = LaboratoryPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["patient__patient_number", "patient__full_name"]
    ordering_fields = ["created_at", "status"]
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "laboratory.view",
        "retrieve": "laboratory.view",
        "create": "laboratory.manage",
        "collect": "laboratory.manage",
        "process": "laboratory.manage",
        "complete": "laboratory.manage",
        "cancel": "laboratory.manage",
        "report": "laboratory.manage",
    }

    def get_queryset(self):
        queryset = visible_orders(self.request)
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
        encounter = parse_uuid(self.request.query_params.get("encounter"), "encounter")
        if encounter is not None:
            queryset = queryset.filter(encounter_id=encounter)
        status = self.request.query_params.get("status", "")
        if status:
            if status not in LabOrder.Status.values:
                raise DRFValidationError({"status": "Unknown lab order status."})
            queryset = queryset.filter(status=status)
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def perform_create(self, serializer):
        order = run_service(lambda: serializer.save(created_by=self.request.user))
        audit(self.request, order, "laboratory.LabOrder", "laboratory.order_created", "created")
        return order

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order = self.perform_create(serializer)
        return Response(self.get_serializer(order).data, status=201)

    def _transition(self, request, func, action, result):
        order = self.get_object()
        order = run_service(lambda: func(order.pk))
        audit(request, order, "laboratory.LabOrder", action, result)
        return Response(self.get_serializer(order).data)

    @action(detail=True, methods=["post"])
    def collect(self, request, pk=None, **kwargs):
        return self._transition(request, collect_sample, "laboratory.sample_collected", "sample_collected")

    @action(detail=True, methods=["post"])
    def process(self, request, pk=None, **kwargs):
        return self._transition(request, start_processing, "laboratory.processing_started", "processing")

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None, **kwargs):
        return self._transition(request, complete_order, "laboratory.order_completed", "completed")

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None, **kwargs):
        return self._transition(request, cancel_order, "laboratory.order_cancelled", "cancelled")

    @action(detail=True, methods=["post"])
    def report(self, request, pk=None, **kwargs):
        order = self.get_object()
        order = run_service(lambda: generate_report(order.pk, request.user))
        audit(request, order, "laboratory.LabOrder", "laboratory.report_generated", "reported")
        return Response(self.get_serializer(order).data)


class LabOrderItemViewSet(viewsets.ModelViewSet):
    queryset = LabOrderItem.objects.all()
    serializer_class = LabOrderItemSerializer
    permission_classes = [LaboratoryPermission]
    pagination_class = LaboratoryPagination
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "laboratory.view",
        "retrieve": "laboratory.view",
        "create": "laboratory.manage",
    }

    def get_order(self):
        if not hasattr(self, "_order"):
            self._order = get_object_or_404(visible_orders(self.request), pk=self.kwargs["order_id"])
        return self._order

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context["order"] = self.get_order()
        return context

    def get_queryset(self):
        return self.queryset.filter(order=self.get_order())

    def perform_create(self, serializer):
        item = run_service(lambda: serializer.save(created_by=self.request.user))
        audit(self.request, item, "laboratory.LabOrderItem", "laboratory.item_created", "created")
        return item

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        item = self.perform_create(serializer)
        return Response(self.get_serializer(item).data, status=201)


class LabResultViewSet(viewsets.ModelViewSet):
    queryset = LabResult.objects.all()
    serializer_class = LabResultSerializer
    permission_classes = [LaboratoryPermission]
    pagination_class = LaboratoryPagination
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "laboratory.view",
        "retrieve": "laboratory.view",
        "create": "laboratory.manage",
        "verify": "laboratory.manage",
    }

    def get_order(self):
        if not hasattr(self, "_order"):
            self._order = get_object_or_404(visible_orders(self.request), pk=self.kwargs["order_id"])
        return self._order

    def get_item(self):
        if not hasattr(self, "_item"):
            self._item = get_object_or_404(
                LabOrderItem.objects.filter(order=self.get_order()),
                pk=self.kwargs["item_id"],
            )
        return self._item

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.action != "verify":
            context["item"] = self.get_item()
        return context

    def get_queryset(self):
        return self.queryset.filter(order_item=self.get_item())

    def perform_create(self, serializer):
        result = run_service(lambda: serializer.save(recorded_by=self.request.user))
        if result.supersedes_id:
            action, outcome = "laboratory.result_corrected", "corrected"
        else:
            action, outcome = "laboratory.result_recorded", "created"
        audit(self.request, result, "laboratory.LabResult", action, outcome)
        return result

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = self.perform_create(serializer)
        return Response(self.get_serializer(result).data, status=201)

    def verify(self, request, order_id=None, item_id=None, pk=None, **kwargs):
        result = self.get_object()
        result = run_service(lambda: verify_result(result.pk, request.user))
        audit(request, result, "laboratory.LabResult", "laboratory.result_verified", "verified")
        return Response(self.get_serializer(result).data)
