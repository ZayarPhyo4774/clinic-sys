import hashlib
import json
import uuid

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.accounts.services import permissions_for_user
from apps.audit.services import record_audit_event
from apps.clinics.models import Branch
from apps.encounters.models import ClinicalNote, Encounter, VitalSign
from apps.prescriptions.models import Prescription, PrescriptionItem
from apps.synchronization.models import SyncChange, SyncOperation

SUPPORTED = {
    "encounters.VitalSign": "vitals.record",
    "encounters.ClinicalNote": "encounters.create",
    "prescriptions.Prescription": "prescriptions.create",
}
VIEW_PERMISSION = {
    "encounters.VitalSign": "encounters.view",
    "encounters.ClinicalNote": "encounters.view",
    "prescriptions.Prescription": "prescriptions.view",
}


class SyncFailed(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


class SyncConflict(Exception):
    def __init__(self, message):
        super().__init__(message)
        self.message = message


def payload_hash(payload) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode()).hexdigest()


def push_batch(operations, *, user, ip_address):
    return [push_operation(item, user=user, ip_address=ip_address) for item in operations]


def push_operation(data, *, user, ip_address):
    rejected = _reject_identity(data, user)
    if rejected is not None:
        return rejected
    with transaction.atomic():
        row = _acquire(data, user)
        return _process_locked(row, data, user=user, ip_address=ip_address)


def changes_after(user, *, cursor, branch_id):
    codes = permissions_for_user(user, branch_id)
    visible = [entity for entity, code in VIEW_PERMISSION.items() if code in codes]
    queryset = SyncChange.objects.filter(clinic_id=user.clinic_id, id__gt=cursor)
    if branch_id is not None:
        queryset = queryset.filter(branch_id=branch_id)
    if visible:
        queryset = queryset.filter(entity_type__in=visible)
    else:
        queryset = queryset.none()
    rows = list(queryset.order_by("id")[:100])
    next_cursor = rows[-1].id if rows else cursor
    return {"cursor": cursor, "next_cursor": next_cursor, "changes": [_change_result(row) for row in rows]}


def status_for(user, *, device_id):
    queryset = SyncOperation.objects.filter(user=user)
    if device_id:
        queryset = queryset.filter(device_id=device_id)
    counts = {status: 0 for status, _label in SyncOperation.Status.choices}
    for status in queryset.values_list("status", flat=True):
        counts[status] = counts.get(status, 0) + 1
    latest_error = (
        queryset.exclude(last_error="")
        .order_by("-received_at")
        .values_list("last_error", flat=True)
        .first()
        or ""
    )
    latest_change = SyncChange.objects.filter(clinic_id=user.clinic_id).order_by("-id").values_list("id", flat=True).first()
    operations = [_operation_result(row) for row in queryset.order_by("-received_at")[:50]]
    return {
        "device_id": device_id or None,
        "cursor": latest_change or 0,
        "counts": counts,
        "last_error": latest_error,
        "operations": operations,
    }


def _reject_identity(data, user):
    if user.clinic_id is None or data["clinic_id"] != user.clinic_id:
        return _unstored_result(data, "This clinic was not found.")
    if data["user_id"] != user.id:
        return _unstored_result(data, "The operation user does not match the signed-in user.")
    branch = Branch.objects.filter(id=data["branch_id"], clinic_id=user.clinic_id).first()
    if branch is None:
        return _unstored_result(data, "This record was not found.")
    if not branch.is_active:
        return _unstored_result(data, "Branch is not authorized.")
    return None


def _unstored_result(data, message):
    return {
        "operation_id": str(data["operation_id"]),
        "device_id": data["device_id"],
        "user_id": str(data["user_id"]),
        "clinic_id": str(data["clinic_id"]),
        "branch_id": str(data["branch_id"]),
        "entity_type": data["entity_type"],
        "entity_id": str(data["entity_id"]) if data.get("entity_id") else None,
        "operation": data["operation"],
        "status": SyncOperation.Status.FAILED,
        "retry_count": 0,
        "last_error": message,
        "duplicate": False,
        "server_entity_id": None,
        "acknowledged_at": None,
    }


def _acquire(data, user):
    operation_id = data["operation_id"]
    existing = SyncOperation.objects.select_for_update().filter(operation_id=operation_id).first()
    if existing is not None:
        return existing
    try:
        with transaction.atomic():
            return SyncOperation.objects.create(
                operation_id=operation_id,
                device_id=data["device_id"],
                user=user,
                clinic_id=data["clinic_id"],
                branch_id=data["branch_id"],
                entity_type=data["entity_type"],
                entity_id=data.get("entity_id"),
                operation=data["operation"],
                payload=data["payload"],
                payload_hash=payload_hash(data["payload"]),
                created_at=data["created_at"],
                status=SyncOperation.Status.PENDING,
            )
    except IntegrityError:
        return SyncOperation.objects.select_for_update().get(operation_id=operation_id)


def _process_locked(row, data, *, user, ip_address):
    incoming_hash = payload_hash(data["payload"])
    if row.user_id != user.id or row.clinic_id != user.clinic_id:
        return _unstored_result(data, "This record was not found.")
    if row.status == SyncOperation.Status.SYNCED:
        if row.payload_hash != incoming_hash:
            _audit(row, user, ip_address, "synchronization.operation_conflict", "conflict")
            return _operation_result(
                row,
                status=SyncOperation.Status.CONFLICT,
                last_error="This operation was already acknowledged with a different payload.",
            )
        _audit(row, user, ip_address, "synchronization.operation_duplicate", "duplicate")
        return _operation_result(row, duplicate=True)
    if row.status == SyncOperation.Status.CONFLICT:
        return _operation_result(row)

    if row.status == SyncOperation.Status.FAILED and row.payload_hash != incoming_hash:
        row.payload = data["payload"]
        row.payload_hash = incoming_hash
        row.operation = data["operation"]
        row.entity_type = data["entity_type"]
        row.entity_id = data.get("entity_id")
        row.device_id = data["device_id"]
        row.branch_id = data["branch_id"]
        row.created_at = data["created_at"]

    try:
        with transaction.atomic():
            server_entity_id, snapshot = _apply(row, user)
    except SyncConflict as exc:
        row.status = SyncOperation.Status.CONFLICT
        row.last_error = exc.message
        row.save()
        _audit(row, user, ip_address, "synchronization.operation_conflict", "conflict")
        return _operation_result(row)
    except SyncFailed as exc:
        row.status = SyncOperation.Status.FAILED
        row.last_error = exc.message
        row.retry_count += 1
        row.save()
        _audit(row, user, ip_address, "synchronization.operation_failed", "failed")
        return _operation_result(row)
    except DjangoValidationError as exc:
        row.status = SyncOperation.Status.FAILED
        row.last_error = _validation_message(exc)
        row.retry_count += 1
        row.save()
        _audit(row, user, ip_address, "synchronization.operation_failed", "failed")
        return _operation_result(row)
    except IntegrityError:
        row.status = SyncOperation.Status.FAILED
        row.last_error = "This record was not found."
        row.retry_count += 1
        row.save()
        _audit(row, user, ip_address, "synchronization.operation_failed", "failed")
        return _operation_result(row)

    row.status = SyncOperation.Status.SYNCED
    row.server_entity_id = server_entity_id
    row.last_error = ""
    row.acknowledged_at = timezone.now()
    row.save()
    SyncChange.objects.create(
        operation=row,
        clinic_id=row.clinic_id,
        branch_id=row.branch_id,
        device_id=row.device_id,
        user_id=row.user_id,
        entity_type=row.entity_type,
        entity_id=server_entity_id,
        operation_name=row.operation,
        payload=snapshot,
    )
    _audit(row, user, ip_address, "synchronization.operation_synced", "synced")
    return _operation_result(row)


_ALLOWED_PAYLOAD = {
    "encounters.VitalSign": set(VitalSign.content_fields) | {"encounter"},
    "encounters.ClinicalNote": {"encounter", "body"},
    "prescriptions.Prescription": {
        "encounter",
        "medicine",
        "quantity",
        "dosage",
        "frequency",
        "duration_days",
    },
}


def _apply(row, user):
    permission = SUPPORTED.get(row.entity_type)
    if permission is None:
        raise SyncFailed("This operation is not supported.")
    if row.operation != SyncOperation.Operation.CREATE:
        raise SyncConflict("This device does not replace a clinical record.")
    extra = set(row.payload) - _ALLOWED_PAYLOAD[row.entity_type]
    if extra:
        raise SyncConflict("This device does not replace a clinical record.")
    if permission not in permissions_for_user(user, row.branch_id):
        raise SyncFailed("You do not have permission for this operation.")
    if row.entity_type == "encounters.VitalSign":
        return _create_vital(row, user)
    if row.entity_type == "encounters.ClinicalNote":
        return _create_note(row, user)
    return _create_prescription(row, user)


def _create_vital(row, user):
    encounter = _open_encounter(row)
    if encounter.phase != Encounter.Phase.TRIAGE:
        raise SyncFailed("Vitals can only be recorded during triage.")
    payload = row.payload
    vital = VitalSign(encounter=encounter, recorded_by=user)
    for field in VitalSign.content_fields:
        if payload.get(field) not in (None, ""):
            setattr(vital, field, payload.get(field))
    vital.save()
    return vital.id, _vital_snapshot(vital)


def _create_note(row, user):
    encounter = _open_encounter(row)
    if encounter.phase != Encounter.Phase.CONSULTATION:
        raise SyncFailed("Start the consultation before recording clinical facts.")
    note = ClinicalNote(encounter=encounter, recorded_by=user, body=row.payload.get("body") or "")
    note.save()
    return note.id, {"id": str(note.id), "encounter": str(note.encounter_id), "body": note.body, "status": note.status}


def _create_prescription(row, user):
    encounter = _open_encounter(row)
    if encounter.phase != Encounter.Phase.CONSULTATION:
        raise SyncFailed("Start the consultation before recording clinical facts.")
    payload = row.payload
    medicine = payload.get("medicine")
    if not medicine:
        raise SyncFailed("medicine: Medicine is required.")
    prescription = Prescription(encounter=encounter, created_by=user, status=Prescription.Status.ACTIVE)
    prescription.save()
    duration = payload.get("duration_days")
    item = PrescriptionItem(
        prescription=prescription,
        medicine_id=_uuid(medicine, "medicine"),
        quantity=payload.get("quantity") or 0,
        dosage=payload.get("dosage") or "",
        frequency=payload.get("frequency") or "",
        duration_days=duration if duration not in ("", None) else None,
        created_by=user,
    )
    item.save()
    return prescription.id, {
        "id": str(prescription.id),
        "encounter": str(prescription.encounter_id),
        "item_id": str(item.id),
        "medicine": str(item.medicine_id),
        "quantity": item.quantity,
        "dosage": item.dosage,
        "frequency": item.frequency,
        "duration_days": item.duration_days,
        "status": prescription.status,
    }


def _open_encounter(row):
    raw = row.payload.get("encounter")
    if not raw:
        raise SyncFailed("encounter: Encounter is required.")
    encounter = (
        Encounter.objects.select_for_update()
        .filter(pk=_uuid(raw, "encounter"), clinic_id=row.clinic_id)
        .first()
    )
    if encounter is None:
        raise SyncFailed("This record was not found.")
    if encounter.branch_id != row.branch_id:
        raise SyncFailed("Branch is not authorized.")
    return encounter


def _uuid(value, field):
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise SyncFailed(f"{field}: Must be a UUID.") from exc


def _vital_snapshot(vital):
    snapshot = {
        "id": str(vital.id),
        "encounter": str(vital.encounter_id),
        "status": vital.status,
    }
    for field in VitalSign.content_fields:
        value = getattr(vital, field)
        if value is None:
            snapshot[field] = None
        elif isinstance(value, int):
            snapshot[field] = value
        else:
            snapshot[field] = str(value)
    return snapshot


def _validation_message(exc):
    if getattr(exc, "message_dict", None):
        parts = []
        for key, messages in exc.message_dict.items():
            text = messages[0] if isinstance(messages, (list, tuple)) else messages
            parts.append(f"{key}: {text}")
        return "; ".join(parts)[:500]
    if getattr(exc, "messages", None):
        return "; ".join(str(item) for item in exc.messages)[:500]
    return "The operation was rejected."


def _audit(row, user, ip_address, action, result):
    record_audit_event(
        actor=user,
        action=action,
        entity_type=row.entity_type,
        entity_id=row.server_entity_id or row.entity_id,
        clinic=row.clinic,
        branch=row.branch,
        device_id=row.device_id,
        ip_address=ip_address,
        metadata={"result": result},
    )


def _operation_result(row, *, status=None, last_error=None, duplicate=False):
    entity_id = row.server_entity_id or row.entity_id
    return {
        "operation_id": str(row.operation_id),
        "device_id": row.device_id,
        "user_id": str(row.user_id),
        "clinic_id": str(row.clinic_id),
        "branch_id": str(row.branch_id),
        "entity_type": row.entity_type,
        "entity_id": str(entity_id) if entity_id else None,
        "operation": row.operation,
        "status": status or row.status,
        "retry_count": row.retry_count,
        "last_error": row.last_error if last_error is None else last_error,
        "duplicate": duplicate,
        "server_entity_id": str(row.server_entity_id) if row.server_entity_id else None,
        "acknowledged_at": row.acknowledged_at.isoformat() if row.acknowledged_at else None,
    }


def _change_result(change):
    return {
        "cursor": change.id,
        "operation_id": str(change.operation_id),
        "device_id": change.device_id,
        "user_id": str(change.user_id),
        "clinic_id": str(change.clinic_id),
        "branch_id": str(change.branch_id),
        "entity_type": change.entity_type,
        "entity_id": str(change.entity_id) if change.entity_id else None,
        "operation": change.operation_name,
        "payload": change.payload,
        "created_at": change.operation.created_at.isoformat(),
        "status": SyncOperation.Status.SYNCED,
        "retry_count": change.operation.retry_count,
        "last_error": "",
    }
