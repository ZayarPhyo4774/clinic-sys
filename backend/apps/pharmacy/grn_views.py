from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.filters import OrderingFilter, SearchFilter
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.services import client_ip, record_audit_event
from apps.clinics.scoping import apply_clinic_scope, header_branch_id, parse_bool, parse_uuid
from apps.pharmacy.grn_serializers import (
    GoodsReceiptLineCreateSerializer,
    GoodsReceiptLineSerializer,
    GoodsReceiptNoteSerializer,
    StockTransferSerializer,
)
from apps.pharmacy.grn_services import bulk_receive_stock, issue_transfer, post_grn
from apps.pharmacy.import_services import parse_stock_receive_csv
from apps.pharmacy.models import GoodsReceiptNote, MedicineBatch, Supplier
from apps.pharmacy.pagination import PharmacyPagination
from apps.pharmacy.permissions import PharmacyPermission
from apps.pharmacy.views import audit, run_service


class GoodsReceiptNoteViewSet(viewsets.ModelViewSet):
    serializer_class = GoodsReceiptNoteSerializer
    permission_classes = [PharmacyPermission]
    pagination_class = PharmacyPagination
    filter_backends = [SearchFilter, OrderingFilter]
    search_fields = ["reference_number", "notes"]
    ordering_fields = ["received_at", "created_at"]
    http_method_names = ["get", "post", "patch", "head", "options"]
    permission_map = {
        "list": "pharmacy.view",
        "retrieve": "pharmacy.view",
        "create": "pharmacy.manage",
        "partial_update": "pharmacy.manage",
        "add_line": "pharmacy.manage",
        "post_receipt": "pharmacy.manage",
    }

    def get_queryset(self):
        queryset = apply_clinic_scope(
            GoodsReceiptNote.objects.select_related("branch", "supplier").prefetch_related("lines__medicine"),
            self.request.user,
            "clinic_id",
        )
        header = header_branch_id(self.request)
        if header is not None:
            queryset = queryset.filter(branch_id=header)
        if self.action != "list":
            return queryset
        status_filter = self.request.query_params.get("status", "")
        if status_filter:
            if status_filter not in GoodsReceiptNote.Status.values:
                raise DRFValidationError({"status": "Unknown GRN status."})
            queryset = queryset.filter(status=status_filter)
        return queryset

    def create(self, request, *args, **kwargs):
        payload = request.data.copy()
        header = header_branch_id(request)
        if header is not None and not payload.get("branch"):
            payload["branch"] = str(header)
        serializer = self.get_serializer(data=payload)
        serializer.is_valid(raise_exception=True)
        grn = self.perform_create(serializer)
        return Response(self.get_serializer(grn).data, status=status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        grn = run_service(serializer.save)
        audit(self.request, grn, "pharmacy.GoodsReceiptNote", "pharmacy.grn_created", "created")
        return grn

    def partial_update(self, request, *args, **kwargs):
        grn = self.get_object()
        if grn.status != GoodsReceiptNote.Status.DRAFT:
            raise DRFValidationError({"status": "Only draft GRNs can be edited."})
        return super().partial_update(request, *args, **kwargs)

    @action(detail=True, methods=["post"], url_path="lines")
    def add_line(self, request, **kwargs):
        grn = self.get_object()
        serializer = GoodsReceiptLineCreateSerializer(data=request.data, context={"request": request, "grn": grn})
        serializer.is_valid(raise_exception=True)
        line = run_service(serializer.save)
        return Response(GoodsReceiptLineSerializer(line).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["post"], url_path="post")
    def post_receipt(self, request, **kwargs):
        grn = self.get_object()
        posted = run_service(lambda: post_grn(grn=grn, user=request.user))
        audit(self.request, posted, "pharmacy.GoodsReceiptNote", "pharmacy.grn_posted", "posted")
        posted = self.get_queryset().get(pk=posted.pk)
        return Response(self.get_serializer(posted).data)


class BulkStockReceiveView(APIView):
    permission_classes = [PharmacyPermission]
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    required_permission = "pharmacy.manage"

    def post(self, request, **kwargs):
        if not request.user.clinic_id:
            raise DRFValidationError("User is not assigned to a clinic.")

        from apps.clinics.models import Branch

        branch_id = header_branch_id(request) or parse_uuid(request.data.get("branch"), "branch")
        if branch_id is None:
            raise DRFValidationError({"branch": "Select a branch before receiving stock."})
        branch = apply_clinic_scope(
            Branch.objects.filter(id=branch_id, is_active=True),
            request.user,
            "clinic_id",
        ).first()
        if branch is None:
            raise DRFValidationError({"branch": "Branch is not authorized."})

        supplier = None
        supplier_id = parse_uuid(request.data.get("supplier"), "supplier")
        if supplier_id is not None:
            supplier = Supplier.objects.filter(id=supplier_id, clinic_id=request.user.clinic_id).first()
            if supplier is None:
                raise DRFValidationError({"supplier": "Supplier is not authorized."})

        upload = request.FILES.get("file")
        if upload is not None:
            rows = run_service(lambda: parse_stock_receive_csv(upload.read()))
        elif isinstance(request.data, dict) and isinstance(request.data.get("rows"), list):
            rows = request.data["rows"]
        else:
            raise DRFValidationError({"file": "Upload a CSV file or provide a rows array."})

        result = run_service(
            lambda: bulk_receive_stock(
                branch=branch,
                user=request.user,
                rows=rows,
                supplier=supplier,
                reference_number=str(request.data.get("reference_number") or ""),
            )
        )
        if result["created"] or result["updated"]:
            record_audit_event(
                actor=request.user,
                action="pharmacy.bulk_stock_received",
                entity_type="pharmacy.MedicineBatch",
                entity_id=branch.id,
                clinic=request.user.clinic,
                branch=branch,
                ip_address=client_ip(request),
                metadata=result,
            )
        return Response(result)


class StockTransferView(APIView):
    permission_classes = [PharmacyPermission]
    required_permission = "pharmacy.manage"

    def post(self, request, **kwargs):
        serializer = StockTransferSerializer(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        result = run_service(
            lambda: issue_transfer(
                source_batch=serializer.validated_data["source_batch"],
                destination_branch=serializer.validated_data["destination_branch"],
                quantity=serializer.validated_data["quantity"],
                user=request.user,
            )
        )
        record_audit_event(
            actor=request.user,
            action="pharmacy.stock_transferred",
            entity_type="pharmacy.StockTransaction",
            entity_id=result["out_transaction_id"],
            clinic=request.user.clinic,
            branch=serializer.validated_data["source_batch"].branch,
            ip_address=client_ip(request),
            metadata=result,
        )
        return Response(result, status=status.HTTP_201_CREATED)
