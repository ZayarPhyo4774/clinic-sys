from apps.audit.models import AuditEvent
from apps.audit.sanitization import sanitize_metadata


def client_ip(request) -> str | None:
    return request.META.get("REMOTE_ADDR") or None


def record_audit_event(
    *,
    action,
    entity_type,
    actor=None,
    entity_id=None,
    clinic=None,
    branch=None,
    device_id="",
    metadata=None,
    ip_address=None,
):
    if actor is not None and clinic is None:
        clinic = getattr(actor, "clinic", None)
    return AuditEvent.objects.create(
        actor=actor,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        clinic=clinic,
        branch=branch,
        device_id=device_id or "",
        metadata=sanitize_metadata(metadata or {}),
        ip_address=ip_address or None,
    )
