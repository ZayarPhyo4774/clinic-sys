from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.laboratory.models import LabOrder, LabOrderItem, LabResult


def _lock_order(order_id) -> LabOrder:
    return LabOrder.objects.select_for_update().get(pk=order_id)


def add_item(*, order_id, lab_test, user) -> LabOrderItem:
    try:
        with transaction.atomic():
            order = _lock_order(order_id)
            if order.status not in LabOrder.OPENABLE:
                raise ValidationError({"order": "Tests cannot be added to this order."})
            item = LabOrderItem(order=order, lab_test=lab_test, created_by=user)
            item.save()
            return item
    except IntegrityError as exc:
        raise ValidationError({"lab_test": "This test is already on the order."}) from exc


def collect_sample(order_id) -> LabOrder:
    with transaction.atomic():
        order = _lock_order(order_id)
        if order.status != LabOrder.Status.ORDERED:
            raise ValidationError({"status": "This status change is not allowed."})
        if not order.items.exists():
            raise ValidationError({"status": "Add a test before collecting the sample."})
        order.status = LabOrder.Status.SAMPLE_COLLECTED
        order.save(update_fields=["status", "updated_at"])
        return order


def start_processing(order_id) -> LabOrder:
    with transaction.atomic():
        order = _lock_order(order_id)
        if order.status != LabOrder.Status.SAMPLE_COLLECTED:
            raise ValidationError({"status": "This status change is not allowed."})
        order.status = LabOrder.Status.PROCESSING
        order.save(update_fields=["status", "updated_at"])
        return order


def cancel_order(order_id) -> LabOrder:
    with transaction.atomic():
        order = _lock_order(order_id)
        if order.status not in {
            LabOrder.Status.ORDERED,
            LabOrder.Status.SAMPLE_COLLECTED,
            LabOrder.Status.PROCESSING,
        }:
            raise ValidationError({"status": "This status change is not allowed."})
        if LabResult.objects.filter(order_item__order=order).exists():
            raise ValidationError({"status": "This order can no longer be cancelled."})
        order.status = LabOrder.Status.CANCELLED
        order.save(update_fields=["status", "updated_at"])
        return order


def record_result(*, item_id, value, user, supersedes=None) -> LabResult:
    with transaction.atomic():
        item = LabOrderItem.objects.select_related("order", "lab_test").get(pk=item_id)
        order = _lock_order(item.order_id)
        item = LabOrderItem.objects.select_related("lab_test").get(pk=item_id)
        if order.status != LabOrder.Status.PROCESSING:
            raise ValidationError({"status": "Results are entered while the order is processing."})
        supersedes_id = getattr(supersedes, "pk", supersedes)
        if supersedes_id:
            previous = LabResult.objects.select_for_update().get(pk=supersedes_id)
            if previous.order_item_id != item.id or previous.status != LabResult.Status.ACTIVE:
                raise ValidationError({"supersedes": "Choose the active result for this test."})
            previous.status = LabResult.Status.CORRECTED
            previous.save(update_fields=["status", "updated_at"])
        result = LabResult(order_item=item, value=value, recorded_by=user, supersedes_id=supersedes_id)
        result.save()
        return result


def verify_result(result_id, user) -> LabResult:
    with transaction.atomic():
        current = LabResult.objects.select_related("order_item").get(pk=result_id)
        order = _lock_order(current.order_item.order_id)
        result = LabResult.objects.select_for_update().get(pk=result_id)
        if order.status != LabOrder.Status.PROCESSING:
            raise ValidationError({"status": "Results are verified while the order is processing."})
        if result.status != LabResult.Status.ACTIVE:
            raise ValidationError({"status": "This status change is not allowed."})
        if result.verified_at is not None:
            raise ValidationError({"status": "This result is already verified."})
        result.verified_at = timezone.now()
        result.verified_by = user
        result._verify_update = True
        result.save(update_fields=["verified_at", "verified_by", "updated_at"])
        return result


def complete_order(order_id) -> LabOrder:
    with transaction.atomic():
        order = _lock_order(order_id)
        if order.status != LabOrder.Status.PROCESSING:
            raise ValidationError({"status": "This status change is not allowed."})
        items = list(order.items.all())
        if not items:
            raise ValidationError({"status": "Add a test before completing the order."})
        for item in items:
            active = LabResult.objects.filter(order_item=item, status=LabResult.Status.ACTIVE).first()
            if active is None or active.verified_at is None:
                raise ValidationError({"status": "Every test needs a verified result."})
        order.status = LabOrder.Status.COMPLETED
        order.save(update_fields=["status", "updated_at"])
        return order


def generate_report(order_id, user) -> LabOrder:
    with transaction.atomic():
        order = _lock_order(order_id)
        if order.status != LabOrder.Status.COMPLETED:
            raise ValidationError({"status": "The order is not completed."})
        if order.reported_at is not None:
            raise ValidationError({"status": "A report was already generated."})
        order.reported_at = timezone.now()
        order.reported_by = user
        order.save(update_fields=["reported_at", "reported_by", "updated_at"])
        return order
