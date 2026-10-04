from datetime import date

from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response

from apps.appointments.pagination import SchedulingPagination
from apps.appointments.permissions import SchedulingPermission
from apps.appointments.views import audit, run_service, visible_rows
from apps.clinics.scoping import parse_uuid
from apps.queues.models import QueueEntry
from apps.queues.serializers import QueueEntrySerializer
from apps.queues.services import (
    call_queue_entry,
    complete_consultation,
    requeue_entry,
    skip_queue_entry,
    start_consultation,
)


class QueueEntryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = QueueEntrySerializer
    permission_classes = [SchedulingPermission]
    pagination_class = SchedulingPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["patient__patient_number", "patient__full_name"]
    ordering_fields = ["position", "service_date", "created_at"]
    permission_map = {
        "list": "appointments.view",
        "retrieve": "appointments.view",
        "call": "appointments.update",
        "start": "appointments.update",
        "complete": "appointments.update",
        "skip": "appointments.update",
        "requeue": "appointments.update",
    }

    def get_queryset(self):
        queryset = visible_rows(
            QueueEntry.objects.select_related(
                "appointment",
                "clinic",
                "branch",
                "patient",
                "doctor",
                "doctor__staff",
                "doctor__staff__user",
                "created_by",
            ),
            self.request,
        )
        if self.action != "list":
            return queryset
        from apps.appointments.views import _apply_list_branch

        queryset = _apply_list_branch(queryset, self.request)
        doctor = parse_uuid(self.request.query_params.get("doctor"), "doctor")
        if doctor is not None:
            queryset = queryset.filter(doctor_id=doctor)
        status = self.request.query_params.get("status", "")
        if status:
            if status not in QueueEntry.Status.values:
                raise DRFValidationError({"status": "Unknown queue status."})
            queryset = queryset.filter(status=status)
        raw_date = self.request.query_params.get("date", "")
        if raw_date:
            try:
                parsed = date.fromisoformat(raw_date)
            except ValueError as exc:
                raise DRFValidationError({"date": "Use YYYY-MM-DD."}) from exc
            queryset = queryset.filter(service_date=parsed)
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def _act(self, request, entry_id, func, action_name, result):
        entry = run_service(lambda: func(entry_id))
        audit(request, entry, "queues.QueueEntry", action_name, result)
        return Response(QueueEntrySerializer(entry, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def call(self, request, pk=None, **kwargs):
        self.get_object()
        return self._act(request, pk, call_queue_entry, "queues.queue_called", "called")

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None, **kwargs):
        self.get_object()
        return self._act(request, pk, start_consultation, "queues.queue_started", "started")

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None, **kwargs):
        self.get_object()
        return self._act(request, pk, complete_consultation, "queues.queue_completed", "completed")

    @action(detail=True, methods=["post"])
    def skip(self, request, pk=None, **kwargs):
        self.get_object()
        return self._act(request, pk, skip_queue_entry, "queues.queue_skipped", "skipped")

    @action(detail=True, methods=["post"])
    def requeue(self, request, pk=None, **kwargs):
        self.get_object()
        return self._act(request, pk, requeue_entry, "queues.queue_requeued", "requeued")
