from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError
from django.db.models.functions import TruncDate
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.response import Response
from zoneinfo import ZoneInfo

from apps.appointments.models import Appointment, DoctorSchedule
from apps.appointments.pagination import SchedulingPagination
from apps.appointments.permissions import SchedulingPermission
from apps.appointments.serializers import (
    AppointmentSerializer,
    DoctorScheduleSerializer,
    RescheduleSerializer,
    WalkInSerializer,
)
from apps.appointments.services import (
    cancel_appointment,
    check_in_appointment,
    confirm_appointment,
    mark_no_show,
    reschedule_appointment,
    walk_in_patient,
)
from apps.audit.services import client_ip, record_audit_event
from apps.clinics.scoping import apply_clinic_scope, header_branch_id, parse_bool, parse_uuid
from apps.queues.models import QueueEntry
from apps.queues.serializers import QueueEntrySerializer
from apps.queues.services import create_queue_entry


def visible_rows(queryset, request):
    queryset = apply_clinic_scope(queryset, request.user, "clinic_id")
    header_branch = header_branch_id(request)
    if header_branch is not None:
        queryset = queryset.filter(branch_id=header_branch)
    return queryset


def run_service(func):
    try:
        return func()
    except DjangoValidationError as exc:
        if getattr(exc, "message_dict", None):
            raise DRFValidationError(exc.message_dict) from exc
        raise DRFValidationError(exc.messages) from exc
    except IntegrityError as exc:
        text = str(exc)
        if "queue_position" in text:
            raise DRFValidationError({"position": "Queue position is no longer available."}) from exc
        raise DRFValidationError({"starts_at": "This time is no longer available."}) from exc


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


def _apply_list_branch(queryset, request):
    query_branch = parse_uuid(request.query_params.get("branch"), "branch")
    header_branch = header_branch_id(request)
    if header_branch and query_branch and header_branch != query_branch:
        raise DRFValidationError({"branch": "Must match X-Branch-Id."})
    if query_branch and header_branch is None:
        queryset = queryset.filter(branch_id=query_branch)
    return queryset


class DoctorScheduleViewSet(viewsets.ModelViewSet):
    serializer_class = DoctorScheduleSerializer
    permission_classes = [SchedulingPermission]
    pagination_class = SchedulingPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["doctor__license_number", "doctor__specialty"]
    ordering_fields = ["weekday", "start_time", "created_at"]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    permission_map = {
        "list": "appointments.view",
        "retrieve": "appointments.view",
        "create": "appointments.update",
        "update": "appointments.update",
        "partial_update": "appointments.update",
    }

    def get_queryset(self):
        queryset = visible_rows(
            DoctorSchedule.objects.select_related("clinic", "branch", "doctor", "created_by"),
            self.request,
        )
        if self.action != "list":
            return queryset
        queryset = _apply_list_branch(queryset, self.request)
        active = parse_bool(self.request.query_params.get("is_active"), "is_active")
        if active is not None:
            queryset = queryset.filter(is_active=active)
        doctor = parse_uuid(self.request.query_params.get("doctor"), "doctor")
        if doctor is not None:
            queryset = queryset.filter(doctor_id=doctor)
        weekday = self.request.query_params.get("weekday", "")
        if weekday != "":
            if weekday not in {str(number) for number in range(7)}:
                raise DRFValidationError({"weekday": "Use 0 for Monday through 6 for Sunday."})
            queryset = queryset.filter(weekday=int(weekday))
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def perform_create(self, serializer):
        schedule = run_service(lambda: serializer.save(created_by=self.request.user))
        audit(self.request, schedule, "appointments.DoctorSchedule", "appointments.schedule_created", "created")

    def perform_update(self, serializer):
        schedule = run_service(lambda: serializer.save())
        audit(self.request, schedule, "appointments.DoctorSchedule", "appointments.schedule_updated", "updated")


class AppointmentViewSet(viewsets.ModelViewSet):
    serializer_class = AppointmentSerializer
    permission_classes = [SchedulingPermission]
    permission_requires_all = frozenset({"walk_in"})
    pagination_class = SchedulingPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["patient__patient_number", "patient__full_name"]
    ordering_fields = ["starts_at", "status", "created_at"]
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "appointments.view",
        "retrieve": "appointments.view",
        "create": "appointments.create",
        "walk_in": ("appointments.create", "appointments.update"),
        "confirm": "appointments.update",
        "reschedule": "appointments.update",
        "check_in": "appointments.update",
        "no_show": "appointments.update",
        "queue": "appointments.update",
        "cancel": "appointments.cancel",
    }

    def get_queryset(self):
        queryset = visible_rows(
            Appointment.objects.select_related(
                "clinic",
                "branch",
                "patient",
                "doctor",
                "doctor__staff",
                "doctor__staff__user",
                "schedule",
                "created_by",
            ),
            self.request,
        )
        if self.action != "list":
            return queryset
        queryset = _apply_list_branch(queryset, self.request)
        doctor = parse_uuid(self.request.query_params.get("doctor"), "doctor")
        if doctor is not None:
            queryset = queryset.filter(doctor_id=doctor)
        patient = parse_uuid(self.request.query_params.get("patient"), "patient")
        if patient is not None:
            queryset = queryset.filter(patient_id=patient)
        status = self.request.query_params.get("status", "")
        if status:
            if status not in Appointment.Status.values:
                raise DRFValidationError({"status": "Unknown appointment status."})
            queryset = queryset.filter(status=status)
        raw_date = self.request.query_params.get("date", "")
        if raw_date:
            try:
                parsed = date.fromisoformat(raw_date)
            except ValueError as exc:
                raise DRFValidationError({"date": "Use YYYY-MM-DD."}) from exc
            clinic = getattr(self.request.user, "clinic", None)
            zone = ZoneInfo(clinic.timezone) if clinic is not None else ZoneInfo("UTC")
            queryset = queryset.annotate(local_date=TruncDate("starts_at", tzinfo=zone)).filter(local_date=parsed)
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def perform_create(self, serializer):
        appointment = run_service(lambda: serializer.save(created_by=self.request.user))
        audit(self.request, appointment, "appointments.Appointment", "appointments.appointment_created", "created")
        return appointment

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        appointment = self.perform_create(serializer)
        output = AppointmentSerializer(appointment, context={"request": request})
        return Response(output.data, status=201)

    @action(detail=False, methods=["post"], url_path="walk-in")
    def walk_in(self, request, **kwargs):
        body = WalkInSerializer(data=request.data, context={"request": request})
        body.is_valid(raise_exception=True)
        data = body.validated_data

        def _run():
            return walk_in_patient(
                branch=data["branch"],
                patient=data["patient"],
                doctor=data["doctor"],
                visit_reason=data.get("visit_reason") or "Walk-in",
                created_by=request.user,
                starts_at=data.get("starts_at"),
                ends_at=data.get("ends_at"),
            )

        appointment, entry = run_service(_run)
        audit(request, appointment, "appointments.Appointment", "appointments.walk_in_created", "created")
        audit(request, entry, "queues.QueueEntry", "queues.queue_created", "created")
        return Response(
            {
                "appointment": AppointmentSerializer(appointment, context={"request": request}).data,
                "queue_entry": QueueEntrySerializer(entry, context={"request": request}).data,
            },
            status=201,
        )

    @action(detail=True, methods=["post"])
    def confirm(self, request, pk=None, **kwargs):
        appointment = self.get_object()
        appointment = run_service(lambda: confirm_appointment(appointment.pk))
        audit(request, appointment, "appointments.Appointment", "appointments.appointment_confirmed", "confirmed")
        return Response(AppointmentSerializer(appointment, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def reschedule(self, request, pk=None, **kwargs):
        appointment = self.get_object()
        body = RescheduleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        appointment = run_service(
            lambda: reschedule_appointment(
                appointment.pk,
                starts_at=body.validated_data["starts_at"],
                ends_at=body.validated_data["ends_at"],
            )
        )
        audit(request, appointment, "appointments.Appointment", "appointments.appointment_rescheduled", "rescheduled")
        return Response(AppointmentSerializer(appointment, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="check-in")
    def check_in(self, request, pk=None, **kwargs):
        appointment = self.get_object()
        appointment = run_service(lambda: check_in_appointment(appointment.pk))
        audit(request, appointment, "appointments.Appointment", "appointments.appointment_checked_in", "checked_in")
        return Response(AppointmentSerializer(appointment, context={"request": request}).data)

    @action(detail=True, methods=["post"], url_path="no-show")
    def no_show(self, request, pk=None, **kwargs):
        appointment = self.get_object()
        appointment = run_service(lambda: mark_no_show(appointment.pk))
        audit(request, appointment, "appointments.Appointment", "appointments.appointment_no_show", "no_show")
        return Response(AppointmentSerializer(appointment, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None, **kwargs):
        appointment = self.get_object()
        appointment = run_service(lambda: cancel_appointment(appointment.pk))
        audit(request, appointment, "appointments.Appointment", "appointments.appointment_cancelled", "cancelled")
        entry = QueueEntry.objects.filter(appointment_id=appointment.pk, status=QueueEntry.Status.CANCELLED).first()
        if entry is not None:
            audit(request, entry, "queues.QueueEntry", "queues.queue_cancelled", "cancelled")
        return Response(AppointmentSerializer(appointment, context={"request": request}).data)

    @action(detail=True, methods=["post"])
    def queue(self, request, pk=None, **kwargs):
        appointment = self.get_object()
        entry = run_service(lambda: create_queue_entry(appointment.pk, created_by=request.user))
        audit(request, entry, "queues.QueueEntry", "queues.queue_created", "created")
        return Response(QueueEntrySerializer(entry, context={"request": request}).data, status=201)
