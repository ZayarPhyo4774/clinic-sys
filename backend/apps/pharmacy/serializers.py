from django.db import transaction
from rest_framework import serializers

from apps.clinics.models import Branch
from apps.clinics.scoping import header_branch_id
from apps.pharmacy.models import Medicine, MedicineBatch, MedicineCategory, StockTransaction, Supplier
from apps.pharmacy.services import apply_stock


def _branches(user):
    if user.is_authenticated and user.clinic_id:
        return Branch.objects.filter(clinic_id=user.clinic_id)
    if user.is_authenticated and user.is_superuser:
        return Branch.objects.all()
    return Branch.objects.none()


def _resolve_branch(serializer, attrs):
    request = serializer.context["request"]
    if serializer.instance is None and not request.user.clinic_id and not request.user.is_superuser:
        raise serializers.ValidationError("User is not assigned to a clinic.")
    header = header_branch_id(request)
    branch = attrs.get("branch")
    if serializer.instance is None and branch is None and header is not None:
        queryset = Branch.objects.filter(id=header, is_active=True)
        if request.user.clinic_id:
            queryset = queryset.filter(clinic_id=request.user.clinic_id)
        branch = queryset.first()
        if branch is None:
            raise serializers.ValidationError({"branch": "Branch is not authorized."})
        attrs["branch"] = branch
    if serializer.instance is None and attrs.get("branch") is None:
        raise serializers.ValidationError({"branch": "This field is required."})
    branch = attrs.get("branch", getattr(serializer.instance, "branch", None))
    if header is not None and branch is not None and branch.id != header:
        raise serializers.ValidationError({"branch": "Must match X-Branch-Id."})
    if serializer.instance is None and branch is not None and not branch.is_active:
        raise serializers.ValidationError({"branch": "Branch is not active."})
    return attrs


class MedicineCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = MedicineCategory
        fields = ["id", "clinic", "name", "code", "is_active", "created_at", "updated_at", "created_by"]
        read_only_fields = ["id", "clinic", "created_at", "updated_at", "created_by"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields["code"].read_only = True


class MedicineSerializer(serializers.ModelSerializer):
    available_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = Medicine
        fields = [
            "id",
            "clinic",
            "category",
            "name",
            "code",
            "form",
            "strength",
            "unit",
            "reorder_level",
            "available_quantity",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "clinic", "available_quantity", "created_at", "updated_at", "created_by"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is not None and "category" in self.fields:
            categories = MedicineCategory.objects.all()
            if request.user.is_authenticated and request.user.clinic_id:
                categories = categories.filter(clinic_id=request.user.clinic_id)
            elif not (request.user.is_authenticated and request.user.is_superuser):
                categories = MedicineCategory.objects.none()
            if self.instance is None:
                categories = categories.filter(is_active=True)
            self.fields["category"].queryset = categories
        if self.instance is not None and "code" in self.fields:
            self.fields["code"].read_only = True


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "clinic", "name", "code", "is_active", "created_at", "updated_at", "created_by"]
        read_only_fields = ["id", "clinic", "created_at", "updated_at", "created_by"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        if self.instance is not None:
            self.fields["code"].read_only = True


class MedicineBatchSerializer(serializers.ModelSerializer):
    initial_quantity = serializers.IntegerField(min_value=0, write_only=True, required=False, default=0)

    class Meta:
        model = MedicineBatch
        fields = [
            "id",
            "clinic",
            "branch",
            "medicine",
            "supplier",
            "batch_number",
            "expiry_date",
            "quantity_on_hand",
            "initial_quantity",
            "is_active",
            "created_at",
            "updated_at",
            "created_by",
        ]
        read_only_fields = ["id", "clinic", "quantity_on_hand", "created_at", "updated_at", "created_by"]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None:
            return
        user = request.user
        if "branch" in self.fields:
            self.fields["branch"].queryset = _branches(user)
            self.fields["branch"].required = False
        medicines = Medicine.objects.all()
        suppliers = Supplier.objects.all()
        if user.is_authenticated and user.clinic_id:
            medicines = medicines.filter(clinic_id=user.clinic_id)
            suppliers = suppliers.filter(clinic_id=user.clinic_id)
        elif not (user.is_authenticated and user.is_superuser):
            medicines = Medicine.objects.none()
            suppliers = Supplier.objects.none()
        if self.instance is None:
            medicines = medicines.filter(is_active=True)
            suppliers = suppliers.filter(is_active=True)
        if "medicine" in self.fields:
            self.fields["medicine"].queryset = medicines
        if "supplier" in self.fields:
            self.fields["supplier"].queryset = suppliers
        if self.instance is not None:
            for name in ("branch", "medicine", "supplier", "batch_number", "expiry_date", "initial_quantity"):
                if name in self.fields:
                    self.fields[name].read_only = True

    def validate(self, attrs):
        if self.instance is None:
            return _resolve_branch(self, attrs)
        return attrs

    def create(self, validated_data):
        quantity = validated_data.pop("initial_quantity", 0)
        user = validated_data.get("created_by")
        with transaction.atomic():
            batch = MedicineBatch.objects.create(**validated_data)
            if quantity:
                apply_stock(
                    batch=batch,
                    kind=StockTransaction.Kind.STOCK_IN,
                    direction=StockTransaction.Direction.IN,
                    quantity=quantity,
                    user=user,
                )
                batch.refresh_from_db()
            return batch


class StockTransactionSerializer(serializers.ModelSerializer):
    quantity_on_hand = serializers.IntegerField(source="batch.quantity_on_hand", read_only=True)
    batch_number = serializers.CharField(source="batch.batch_number", read_only=True)
    medicine_name = serializers.CharField(source="medicine.name", read_only=True)

    class Meta:
        model = StockTransaction
        fields = [
            "id",
            "clinic",
            "branch",
            "medicine",
            "medicine_name",
            "batch",
            "batch_number",
            "kind",
            "direction",
            "quantity",
            "reason",
            "prescription_item",
            "quantity_on_hand",
            "recorded_at",
            "recorded_by",
        ]
        read_only_fields = [
            "id",
            "clinic",
            "branch",
            "medicine",
            "medicine_name",
            "batch_number",
            "prescription_item",
            "quantity_on_hand",
            "recorded_at",
            "recorded_by",
        ]
        extra_kwargs = {
            "quantity": {"min_value": 1},
            "direction": {"required": False},
            "reason": {"required": False, "allow_blank": True},
        }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        request = self.context.get("request")
        if request is None or "batch" not in self.fields:
            return
        batches = MedicineBatch.objects.all()
        user = request.user
        if user.is_authenticated and user.clinic_id:
            batches = batches.filter(clinic_id=user.clinic_id)
        elif not (user.is_authenticated and user.is_superuser):
            batches = MedicineBatch.objects.none()
        header = header_branch_id(request) if user.is_authenticated else None
        if header is not None:
            batches = batches.filter(branch_id=header)
        self.fields["batch"].queryset = batches

    def validate(self, attrs):
        kind = attrs.get("kind")
        if kind == StockTransaction.Kind.DISPENSE:
            raise serializers.ValidationError({"kind": "Dispense from the prescription item."})
        if kind == StockTransaction.Kind.TRANSFER:
            raise serializers.ValidationError({"kind": "Use the stock transfer endpoint."})
        if kind == StockTransaction.Kind.STOCK_IN:
            attrs["direction"] = StockTransaction.Direction.IN
        if kind == StockTransaction.Kind.ADJUSTMENT and not attrs.get("direction"):
            raise serializers.ValidationError({"direction": "This field is required."})
        if kind == StockTransaction.Kind.ADJUSTMENT and not attrs.get("reason"):
            raise serializers.ValidationError({"reason": "This field is required."})
        return attrs

    def create(self, validated_data):
        return apply_stock(
            batch=validated_data["batch"],
            kind=validated_data["kind"],
            direction=validated_data.get("direction"),
            quantity=validated_data["quantity"],
            reason=validated_data.get("reason", ""),
            user=validated_data.get("recorded_by"),
        )
