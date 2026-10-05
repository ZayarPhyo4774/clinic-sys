from datetime import date

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db.models import F, IntegerField, OuterRef, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from django.utils import timezone
from zoneinfo import ZoneInfo

from apps.audit.services import client_ip, record_audit_event
from apps.clinics.scoping import apply_clinic_scope, header_branch_id, parse_bool, parse_uuid
from apps.pharmacy.import_services import import_medicines, parse_medicine_csv
from apps.pharmacy.models import Medicine, MedicineBatch, MedicineCategory, StockTransaction, Supplier
from apps.pharmacy.pagination import PharmacyPagination
from apps.pharmacy.permissions import PharmacyPermission
from apps.pharmacy.serializers import (
    MedicineBatchSerializer,
    MedicineCategorySerializer,
    MedicineSerializer,
    StockTransactionSerializer,
    SupplierSerializer,
)


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


def _today(request):
    clinic = getattr(request.user, "clinic", None)
    zone = ZoneInfo(clinic.timezone) if clinic is not None else ZoneInfo("UTC")
    return timezone.now().astimezone(zone).date()


def _clinic_queryset(model, request):
    return apply_clinic_scope(model.objects.all(), request.user, "clinic_id")


class _CatalogViewSet(viewsets.ModelViewSet):
    permission_classes = [PharmacyPermission]
    pagination_class = PharmacyPagination
    http_method_names = ["get", "post", "put", "patch", "head", "options"]

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def perform_create(self, serializer):
        if not self.request.user.clinic_id:
            raise DRFValidationError("User is not assigned to a clinic.")
        return run_service(lambda: serializer.save(clinic=self.request.user.clinic, created_by=self.request.user))

    def perform_update(self, serializer):
        return run_service(serializer.save)


class MedicineCategoryViewSet(_CatalogViewSet):
    serializer_class = MedicineCategorySerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "created_at"]
    permission_map = {
        "list": "pharmacy.view",
        "retrieve": "pharmacy.view",
        "create": "pharmacy.manage",
        "update": "pharmacy.manage",
        "partial_update": "pharmacy.manage",
    }
    audit_entity = "pharmacy.MedicineCategory"
    audit_created = "pharmacy.category_created"
    audit_updated = "pharmacy.category_updated"

    def get_queryset(self):
        return _clinic_queryset(MedicineCategory, self.request)

    def perform_create(self, serializer):
        category = super().perform_create(serializer)
        audit(self.request, category, self.audit_entity, self.audit_created, "created")
        return category

    def perform_update(self, serializer):
        category = super().perform_update(serializer)
        audit(self.request, category, self.audit_entity, self.audit_updated, "updated")
        return category

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        category = self.perform_create(serializer)
        return Response(self.get_serializer(category).data, status=201)


class SupplierViewSet(MedicineCategoryViewSet):
    serializer_class = SupplierSerializer
    permission_map = MedicineCategoryViewSet.permission_map
    audit_entity = "pharmacy.Supplier"
    audit_created = "pharmacy.supplier_created"
    audit_updated = "pharmacy.supplier_updated"

    def get_queryset(self):
        return _clinic_queryset(Supplier, self.request)


class MedicineViewSet(_CatalogViewSet):
    serializer_class = MedicineSerializer
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["name", "code"]
    ordering_fields = ["name", "created_at"]
    permission_map = {
        **MedicineCategoryViewSet.permission_map,
        "bulk_import": "pharmacy.manage",
    }

    def get_queryset(self):
        today = _today(self.request)
        filters = {"medicine_id": OuterRef("pk"), "is_active": True, "expiry_date__gte": today}
        header = header_branch_id(self.request)
        if header is not None:
            filters["branch_id"] = header
        stock = (
            MedicineBatch.objects.filter(**filters)
            .values("medicine_id")
            .annotate(total=Sum("quantity_on_hand"))
            .values("total")
        )
        queryset = _clinic_queryset(Medicine, self.request).annotate(
            available_quantity=Coalesce(Subquery(stock, output_field=IntegerField()), Value(0))
        )
        if self.action != "list":
            return queryset
        category = parse_uuid(self.request.query_params.get("category"), "category")
        if category is not None:
            queryset = queryset.filter(category_id=category)
        active = parse_bool(self.request.query_params.get("is_active"), "is_active")
        if active is not None:
            queryset = queryset.filter(is_active=active)
        low_stock = parse_bool(self.request.query_params.get("low_stock"), "low_stock")
        if low_stock:
            queryset = queryset.filter(available_quantity__lte=F("reorder_level"))
        return queryset

    def perform_create(self, serializer):
        medicine = super().perform_create(serializer)
        audit(self.request, medicine, "pharmacy.Medicine", "pharmacy.medicine_created", "created")
        return medicine

    def perform_update(self, serializer):
        medicine = super().perform_update(serializer)
        audit(self.request, medicine, "pharmacy.Medicine", "pharmacy.medicine_updated", "updated")
        return medicine

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        medicine = self.perform_create(serializer)
        medicine = self.get_queryset().get(pk=medicine.pk)
        return Response(self.get_serializer(medicine).data, status=201)

    @action(
        detail=False,
        methods=["post"],
        url_path="bulk-import",
        parser_classes=[MultiPartParser, FormParser, JSONParser],
    )
    def bulk_import(self, request, **kwargs):
        if not request.user.clinic_id:
            raise DRFValidationError("User is not assigned to a clinic.")

        create_missing_categories = parse_bool(
            request.data.get("create_missing_categories"),
            "create_missing_categories",
        )
        if create_missing_categories is None:
            create_missing_categories = True
        skip_duplicates = parse_bool(request.data.get("skip_duplicates"), "skip_duplicates")
        if skip_duplicates is None:
            skip_duplicates = True

        upload = request.FILES.get("file")
        if upload is not None:
            rows = run_service(lambda: parse_medicine_csv(upload.read()))
        elif isinstance(request.data, dict) and isinstance(request.data.get("rows"), list):
            rows = request.data["rows"]
        else:
            raise DRFValidationError({"file": "Upload a CSV file or provide a rows array."})

        result = run_service(
            lambda: import_medicines(
                clinic_id=request.user.clinic_id,
                user=request.user,
                rows=rows,
                create_missing_categories=create_missing_categories,
                skip_duplicates=skip_duplicates,
            )
        )
        if result["created"] or result["categories_created"]:
            record_audit_event(
                actor=request.user,
                action="pharmacy.medicines_bulk_imported",
                entity_type="pharmacy.Medicine",
                entity_id=request.user.clinic_id,
                clinic=request.user.clinic,
                branch=None,
                ip_address=client_ip(request),
                metadata={
                    "created": result["created"],
                    "categories_created": result["categories_created"],
                    "skipped": result["skipped"],
                    "errors": len(result["errors"]),
                },
            )
        return Response(result)


class MedicineBatchViewSet(viewsets.ModelViewSet):
    serializer_class = MedicineBatchSerializer
    permission_classes = [PharmacyPermission]
    pagination_class = PharmacyPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["batch_number"]
    ordering_fields = ["expiry_date", "created_at"]
    http_method_names = ["get", "post", "put", "patch", "head", "options"]
    permission_map = MedicineCategoryViewSet.permission_map

    def get_queryset(self):
        queryset = apply_clinic_scope(
            MedicineBatch.objects.select_related("clinic", "branch", "medicine", "supplier"),
            self.request.user,
            "clinic_id",
        )
        header = header_branch_id(self.request)
        if header is not None:
            queryset = queryset.filter(branch_id=header)
        if self.action != "list":
            return queryset
        query_branch = parse_uuid(self.request.query_params.get("branch"), "branch")
        if header and query_branch and header != query_branch:
            raise DRFValidationError({"branch": "Must match X-Branch-Id."})
        if query_branch and header is None:
            queryset = queryset.filter(branch_id=query_branch)
        medicine = parse_uuid(self.request.query_params.get("medicine"), "medicine")
        if medicine is not None:
            queryset = queryset.filter(medicine_id=medicine)
        active = parse_bool(self.request.query_params.get("is_active"), "is_active")
        if active is not None:
            queryset = queryset.filter(is_active=active)
        today = _today(self.request)
        expired = parse_bool(self.request.query_params.get("expired"), "expired")
        if expired is True:
            queryset = queryset.filter(expiry_date__lt=today)
        elif expired is False:
            queryset = queryset.filter(expiry_date__gte=today)
        raw_before = self.request.query_params.get("expiring_before", "")
        if raw_before:
            try:
                parsed = date.fromisoformat(raw_before)
            except ValueError as exc:
                raise DRFValidationError({"expiring_before": "Use YYYY-MM-DD."}) from exc
            queryset = queryset.filter(expiry_date__lte=parsed)
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def perform_create(self, serializer):
        batch = run_service(lambda: serializer.save(created_by=self.request.user))
        audit(self.request, batch, "pharmacy.MedicineBatch", "pharmacy.batch_created", "created")
        entry = (
            StockTransaction.objects.filter(batch=batch, kind=StockTransaction.Kind.STOCK_IN)
            .order_by("-recorded_at")
            .first()
        )
        if entry is not None:
            audit(self.request, entry, "pharmacy.StockTransaction", "pharmacy.stock_in", "stock_in")
        return batch

    def perform_update(self, serializer):
        return run_service(serializer.save)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        batch = self.perform_create(serializer)
        batch.refresh_from_db()
        return Response(self.get_serializer(batch).data, status=201)


class StockTransactionViewSet(viewsets.ModelViewSet):
    serializer_class = StockTransactionSerializer
    permission_classes = [PharmacyPermission]
    pagination_class = PharmacyPagination
    filter_backends = [OrderingFilter]
    ordering_fields = ["recorded_at"]
    http_method_names = ["get", "post", "head", "options"]
    permission_map = {
        "list": "pharmacy.view",
        "retrieve": "pharmacy.view",
        "create": "pharmacy.manage",
    }

    def get_queryset(self):
        queryset = apply_clinic_scope(
            StockTransaction.objects.select_related("batch", "medicine", "branch"),
            self.request.user,
            "clinic_id",
        )
        header = header_branch_id(self.request)
        if header is not None:
            queryset = queryset.filter(branch_id=header)
        if self.action != "list":
            return queryset
        kind = self.request.query_params.get("kind", "")
        if kind:
            if kind not in StockTransaction.Kind.values:
                raise DRFValidationError({"kind": "Unknown stock transaction kind."})
            queryset = queryset.filter(kind=kind)
        batch = parse_uuid(self.request.query_params.get("batch"), "batch")
        if batch is not None:
            queryset = queryset.filter(batch_id=batch)
        medicine = parse_uuid(self.request.query_params.get("medicine"), "medicine")
        if medicine is not None:
            queryset = queryset.filter(medicine_id=medicine)
        return queryset

    def filter_queryset(self, queryset):
        if self.action != "list":
            return queryset
        return super().filter_queryset(queryset)

    def perform_create(self, serializer):
        entry = run_service(lambda: serializer.save(recorded_by=self.request.user))
        if entry.kind == StockTransaction.Kind.STOCK_IN:
            action, result = "pharmacy.stock_in", "stock_in"
        else:
            action, result = "pharmacy.stock_adjusted", "adjusted"
        audit(self.request, entry, "pharmacy.StockTransaction", action, result)
        return entry

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        entry = self.perform_create(serializer)
        entry.batch.refresh_from_db()
        return Response(self.get_serializer(entry).data, status=201)
