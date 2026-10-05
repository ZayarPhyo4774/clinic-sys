from rest_framework import serializers

from apps.clinics.models import Branch
from apps.clinics.scoping import header_branch_id
from apps.pharmacy.grn_services import add_grn_line, create_grn, post_grn
from apps.pharmacy.models import GoodsReceiptLine, GoodsReceiptNote, Medicine, MedicineBatch, Supplier
from apps.pharmacy.serializers import _branches, _resolve_branch


class GoodsReceiptLineSerializer(serializers.ModelSerializer):
    medicine_name = serializers.CharField(source="medicine.name", read_only=True)
    medicine_code = serializers.CharField(source="medicine.code", read_only=True)
    batch_id = serializers.UUIDField(source="batch.id", read_only=True)

    class Meta:
        model = GoodsReceiptLine
        fields = [
            "id",
            "medicine",
            "medicine_name",
            "medicine_code",
            "batch_number",
            "expiry_date",
            "quantity",
            "batch_id",
            "created_at",
        ]
        read_only_fields = ["id", "medicine_name", "medicine_code", "batch_id", "created_at"]
        extra_kwargs = {"quantity": {"min_value": 1}}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        grn = self.context.get("grn")
        if request is None or "medicine" not in self.fields:
            return
        medicines = Medicine.objects.filter(is_active=True)
        if request.user.is_authenticated and request.user.clinic_id:
            medicines = medicines.filter(clinic_id=request.user.clinic_id)
        elif not (request.user.is_authenticated and request.user.is_superuser):
            medicines = Medicine.objects.none()
        if grn is not None:
            medicines = medicines.filter(clinic_id=grn.clinic_id)
        self.fields["medicine"].queryset = medicines


class GoodsReceiptNoteSerializer(serializers.ModelSerializer):
    lines = GoodsReceiptLineSerializer(many=True, read_only=True)
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    branch_name = serializers.CharField(source="branch.name", read_only=True)
    line_count = serializers.SerializerMethodField()

    class Meta:
        model = GoodsReceiptNote
        fields = [
            "id",
            "clinic",
            "branch",
            "branch_name",
            "supplier",
            "supplier_name",
            "reference_number",
            "received_at",
            "status",
            "notes",
            "lines",
            "line_count",
            "created_at",
            "updated_at",
            "posted_at",
            "created_by",
            "posted_by",
        ]
        read_only_fields = [
            "id",
            "clinic",
            "branch_name",
            "supplier_name",
            "status",
            "lines",
            "line_count",
            "created_at",
            "updated_at",
            "posted_at",
            "posted_by",
            "created_by",
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None:
            return
        user = request.user
        if "branch" in self.fields:
            self.fields["branch"].queryset = _branches(user)
            self.fields["branch"].required = False
        suppliers = Supplier.objects.filter(is_active=True)
        if user.is_authenticated and user.clinic_id:
            suppliers = suppliers.filter(clinic_id=user.clinic_id)
        elif not (user.is_authenticated and user.is_superuser):
            suppliers = Supplier.objects.none()
        if "supplier" in self.fields:
            self.fields["supplier"].queryset = suppliers
            self.fields["supplier"].required = False

    def get_line_count(self, obj) -> int:
        return obj.lines.count()

    def validate(self, attrs):
        if self.instance is None:
            return _resolve_branch(self, attrs)
        return attrs

    def create(self, validated_data):
        request = self.context["request"]
        branch = validated_data["branch"]
        return create_grn(
            branch=branch,
            user=request.user,
            received_at=validated_data["received_at"],
            supplier=validated_data.get("supplier"),
            reference_number=validated_data.get("reference_number", ""),
            notes=validated_data.get("notes", ""),
        )


class GoodsReceiptLineCreateSerializer(serializers.Serializer):
    medicine = serializers.PrimaryKeyRelatedField(queryset=Medicine.objects.none())
    batch_number = serializers.CharField(max_length=60)
    expiry_date = serializers.DateField()
    quantity = serializers.IntegerField(min_value=1)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        grn: GoodsReceiptNote = self.context["grn"]
        self.fields["medicine"].queryset = Medicine.objects.filter(clinic_id=grn.clinic_id, is_active=True)

    def create(self, validated_data):
        return add_grn_line(grn=self.context["grn"], **validated_data)


class StockTransferSerializer(serializers.Serializer):
    source_batch = serializers.PrimaryKeyRelatedField(queryset=MedicineBatch.objects.none())
    destination_branch = serializers.PrimaryKeyRelatedField(queryset=Branch.objects.none())
    quantity = serializers.IntegerField(min_value=1)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        from apps.pharmacy.models import MedicineBatch

        request = self.context["request"]
        batches = MedicineBatch.objects.select_related("branch", "medicine").filter(is_active=True)
        branches = Branch.objects.filter(is_active=True)
        if request.user.is_authenticated and request.user.clinic_id:
            batches = batches.filter(clinic_id=request.user.clinic_id)
            branches = branches.filter(clinic_id=request.user.clinic_id)
        header = header_branch_id(request)
        if header is not None:
            batches = batches.filter(branch_id=header)
        self.fields["source_batch"].queryset = batches
        self.fields["destination_branch"].queryset = branches
