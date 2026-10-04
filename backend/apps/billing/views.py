from django.core.exceptions import ValidationError as DjangoValidationError
from django.shortcuts import get_object_or_404
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.response import Response

from apps.audit.services import client_ip, record_audit_event
from apps.billing.models import Invoice, InvoiceItem, Payment, PaymentMethod
from apps.billing.pagination import BillingPagination
from apps.billing.permissions import BillingPermission
from apps.billing.serializers import (
    InvoiceItemSerializer,
    InvoiceItemWriteSerializer,
    InvoiceSerializer,
    ManualInvoiceCreateSerializer,
    PaymentMethodSerializer,
    PaymentSerializer,
    PaymentWriteSerializer,
)
from apps.billing.services import add_item, create_invoice, create_manual_invoice, issue_invoice, record_payment
from apps.clinics.models import Branch, DoctorProfile
from apps.clinics.scoping import apply_clinic_scope, header_branch_id, parse_bool
from apps.encounters.models import Encounter
from apps.patients.models import Patient
from apps.prescriptions.models import PrescriptionItem


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


def visible_invoices(request):
    queryset = Invoice.objects.select_related(
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


def visible_encounters(request):
    queryset = apply_clinic_scope(Encounter.objects.all(), request.user, "clinic_id")
    header = header_branch_id(request)
    if header is not None:
        queryset = queryset.filter(branch_id=header)
    return queryset


def visible_patients(request):
    queryset = apply_clinic_scope(Patient.objects.all(), request.user, "clinic_id")
    header = header_branch_id(request)
    if header is not None:
        queryset = queryset.filter(branch_id=header)
    return queryset


def visible_doctors(request):
    queryset = apply_clinic_scope(
        DoctorProfile.objects.select_related("staff", "staff__branch"),
        request.user,
        "staff__clinic_id",
    ).filter(staff__is_active=True)
    header = header_branch_id(request)
    if header is not None:
        queryset = queryset.filter(staff__branch_id=header)
    return queryset


class PaymentMethodViewSet(viewsets.ModelViewSet):
    serializer_class = PaymentMethodSerializer
    permission_classes = [BillingPermission]
    pagination_class = BillingPagination
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "billing.view",
        "retrieve": "billing.view",
        "create": "billing.create",
    }

    def get_queryset(self):
        return apply_clinic_scope(PaymentMethod.objects.all(), self.request.user, "clinic_id")

    def perform_create(self, serializer):
        method = run_service(lambda: serializer.save())
        audit(self.request, method, "billing.PaymentMethod", "billing.payment_method_created", "created")
        return method

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = self.perform_create(serializer)
        return Response(self.get_serializer(method).data, status=201)


class InvoiceViewSet(viewsets.ModelViewSet):
    serializer_class = InvoiceSerializer
    permission_classes = [BillingPermission]
    pagination_class = BillingPagination
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "billing.view",
        "retrieve": "billing.view",
        "create": "billing.create",
        "issue": "billing.create",
    }

    def get_queryset(self):
        queryset = visible_invoices(self.request).prefetch_related("items")
        if self.action != "list":
            return queryset
        status = (self.request.query_params.get("status") or "").strip()
        if status:
            if status not in Invoice.Status.values:
                raise DRFValidationError({"status": "Unknown invoice status."})
            queryset = queryset.filter(status=status)
        open_for_payment = parse_bool(self.request.query_params.get("open_for_payment"), "open_for_payment")
        if open_for_payment:
            queryset = queryset.filter(status__in=Invoice.OPEN_FOR_PAYMENT)
        return queryset

    def _create_manual(self, request, data):
        incoming = ManualInvoiceCreateSerializer(data=data)
        incoming.is_valid(raise_exception=True)
        branch_id = header_branch_id(request)
        if branch_id is None:
            raise DRFValidationError({"branch": "Select a branch."})
        branch = get_object_or_404(
            apply_clinic_scope(Branch.objects.filter(is_active=True), request.user, "clinic_id"),
            pk=branch_id,
        )
        patient = get_object_or_404(visible_patients(request), pk=incoming.validated_data["patient"])
        doctor = get_object_or_404(visible_doctors(request), pk=incoming.validated_data["doctor"])
        invoice = run_service(
            lambda: create_manual_invoice(patient=patient, doctor=doctor, branch=branch, user=request.user)
        )
        audit(request, invoice, "billing.Invoice", "billing.invoice_created", "created")
        return Response(self.get_serializer(invoice).data, status=201)

    def create(self, request, *args, **kwargs):
        data = request.data if isinstance(request.data, dict) else {}
        patient_id = data.get("patient")
        doctor_id = data.get("doctor")
        encounter_id = data.get("encounter")

        if patient_id and doctor_id:
            return self._create_manual(request, data)

        if encounter_id:
            encounter = get_object_or_404(visible_encounters(request), pk=encounter_id)
            invoice = run_service(lambda: create_invoice(encounter=encounter, user=request.user))
            audit(request, invoice, "billing.Invoice", "billing.invoice_created", "created")
            return Response(self.get_serializer(invoice).data, status=201)

        if patient_id or doctor_id:
            return self._create_manual(request, data)

        raise DRFValidationError(
            {
                "non_field_errors": [
                    "Choose a patient and doctor for a manual invoice, or create the invoice from an open consultation."
                ]
            }
        )

    @action(detail=True, methods=["post"])
    def issue(self, request, pk=None, **kwargs):
        invoice = self.get_object()
        invoice = run_service(lambda: issue_invoice(invoice.pk, request.user))
        audit(request, invoice, "billing.Invoice", "billing.invoice_issued", "issued")
        return Response(self.get_serializer(invoice).data)


class InvoiceItemViewSet(viewsets.ModelViewSet):
    queryset = InvoiceItem.objects.all()
    serializer_class = InvoiceItemSerializer
    permission_classes = [BillingPermission]
    pagination_class = BillingPagination
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "billing.view",
        "create": "billing.create",
    }

    def get_invoice(self):
        return get_object_or_404(visible_invoices(self.request), pk=self.kwargs["invoice_id"])

    def get_queryset(self):
        return self.queryset.filter(invoice=self.get_invoice())

    def create(self, request, invoice_id=None, **kwargs):
        invoice = self.get_invoice()
        incoming = InvoiceItemWriteSerializer(data=request.data)
        incoming.is_valid(raise_exception=True)
        data = incoming.validated_data
        fields = {
            "kind": data["kind"],
            "quantity": data["quantity"],
            "unit_price": data["unit_price"],
            "discount_amount": data["discount_amount"],
        }
        if data["kind"] == InvoiceItem.Kind.PHARMACY:
            source = get_object_or_404(
                PrescriptionItem.objects.filter(clinic_id=invoice.clinic_id),
                pk=data["prescription_item"],
            )
            fields["prescription_item"] = source
        if data.get("description"):
            fields["description"] = data["description"]
        item = run_service(lambda: add_item(invoice_id=invoice.pk, user=request.user, **fields))
        audit(request, item, "billing.InvoiceItem", "billing.invoice_item_created", "created")
        return Response(InvoiceItemSerializer(item).data, status=201)


class PaymentViewSet(viewsets.ModelViewSet):
    queryset = Payment.objects.all()
    serializer_class = PaymentSerializer
    permission_classes = [BillingPermission]
    pagination_class = BillingPagination
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "billing.view",
        "create": "billing.payment",
    }

    def get_invoice(self):
        return get_object_or_404(visible_invoices(self.request), pk=self.kwargs["invoice_id"])

    def get_queryset(self):
        return self.queryset.filter(invoice=self.get_invoice()).select_related("method")

    def create(self, request, invoice_id=None, **kwargs):
        invoice = self.get_invoice()
        incoming = PaymentWriteSerializer(data=request.data)
        incoming.is_valid(raise_exception=True)
        method = get_object_or_404(
            apply_clinic_scope(PaymentMethod.objects.all(), request.user, "clinic_id"),
            pk=incoming.validated_data["method"],
        )
        payment = run_service(
            lambda: record_payment(
                invoice_id=invoice.pk,
                method=method,
                amount=incoming.validated_data["amount"],
                user=request.user,
            )
        )
        audit(request, payment, "billing.Payment", "billing.payment_recorded", "recorded")
        payment = Payment.objects.select_related("method").get(pk=payment.pk)
        return Response(PaymentSerializer(payment).data, status=201)
