from rest_framework import serializers

from apps.billing.models import ZERO, Invoice, InvoiceItem, Payment, PaymentMethod, money
from apps.billing.services import balance_of
from apps.clinics.serializer_mixins import DoctorFullNameMixin


class PaymentMethodSerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentMethod
        fields = ["id", "clinic", "name", "code", "is_active", "created_at", "updated_at", "created_by"]
        read_only_fields = ["id", "clinic", "created_at", "updated_at", "created_by"]

    def create(self, validated_data):
        request = self.context["request"]
        if not request.user.clinic_id:
            raise serializers.ValidationError("User is not assigned to a clinic.")
        validated_data["clinic"] = request.user.clinic
        validated_data["created_by"] = request.user
        method = PaymentMethod(**validated_data)
        method.save()
        return method


class InvoiceItemSerializer(serializers.ModelSerializer):
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = InvoiceItem
        fields = [
            "id",
            "invoice",
            "kind",
            "prescription_item",
            "description",
            "quantity",
            "unit_price",
            "discount_amount",
            "line_total",
            "created_at",
        ]
        read_only_fields = fields

    def get_line_total(self, item) -> str:
        gross = item.quantity * item.unit_price
        return str(money(gross - item.discount_amount))


class InvoiceItemWriteSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(
        choices=InvoiceItem.Kind.choices,
        error_messages={"required": "Choose a charge type."},
    )
    prescription_item = serializers.UUIDField(required=False, allow_null=True)
    description = serializers.CharField(max_length=50, required=False, allow_blank=True)
    quantity = serializers.IntegerField(
        min_value=1,
        error_messages={"required": "Enter a quantity.", "min_value": "Quantity must be at least 1."},
    )
    unit_price = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        error_messages={"required": "Enter a unit price.", "invalid": "Enter a valid unit price."},
    )
    discount_amount = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        default=ZERO,
    )

    def validate(self, attrs):
        kind = attrs["kind"]
        if kind == InvoiceItem.Kind.PHARMACY and not attrs.get("prescription_item"):
            raise serializers.ValidationError({"prescription_item": "A pharmacy charge needs a dispensed item."})
        if kind == InvoiceItem.Kind.CONSULTATION and attrs.get("prescription_item"):
            raise serializers.ValidationError({"prescription_item": "A consultation charge stands alone."})
        if kind == InvoiceItem.Kind.LABORATORY:
            raise serializers.ValidationError({"kind": "A laboratory charge is not accepted on this route."})
        description = (attrs.get("description") or "").strip()
        if description:
            attrs["description"] = description
        elif "description" in attrs:
            attrs.pop("description", None)
        return attrs


class ManualInvoiceCreateSerializer(serializers.Serializer):
    patient = serializers.UUIDField(error_messages={"required": "Choose a patient."})
    doctor = serializers.UUIDField(error_messages={"required": "Choose a doctor."})


class InvoiceSerializer(DoctorFullNameMixin, serializers.ModelSerializer):
    balance = serializers.SerializerMethodField()
    patient_full_name = serializers.CharField(source="patient.full_name", read_only=True)
    items = InvoiceItemSerializer(many=True, read_only=True)

    class Meta:
        model = Invoice
        fields = [
            "id",
            "clinic",
            "branch",
            "patient",
            "patient_full_name",
            "doctor",
            "doctor_full_name",
            "encounter",
            "invoice_number",
            "currency",
            "status",
            "subtotal",
            "discount_total",
            "tax_amount",
            "total",
            "balance",
            "issued_at",
            "created_at",
            "items",
        ]
        read_only_fields = fields

    def get_balance(self, invoice) -> str:
        return str(balance_of(invoice))


class PaymentWriteSerializer(serializers.Serializer):
    method = serializers.UUIDField()
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)


class PaymentSerializer(serializers.ModelSerializer):
    method_name = serializers.CharField(source="method.name", read_only=True)

    class Meta:
        model = Payment
        fields = ["id", "invoice", "method", "method_name", "amount", "paid_at", "recorded_by"]
        read_only_fields = fields
