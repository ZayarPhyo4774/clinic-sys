import pytest
from django.core.exceptions import ValidationError

from apps.audit.models import AuditEvent
from apps.audit.services import record_audit_event
from testing import PASSWORD


@pytest.mark.django_db
def test_login_writes_audit_events_without_secrets(api_client, user):
    failure = api_client.post(
        "/api/v1/auth/token/",
        {"email": user.email, "password": "wrong-password"},
        format="json",
    )
    assert failure.status_code == 401
    failed_event = AuditEvent.objects.get(action="auth.login_failed")
    assert failed_event.actor_id is None
    assert "wrong-password" not in str(failed_event.metadata)
    assert user.email not in str(failed_event.metadata)

    success = api_client.post(
        "/api/v1/auth/token/",
        {"email": user.email, "password": PASSWORD},
        format="json",
    )
    assert success.status_code == 200
    event = AuditEvent.objects.get(action="auth.login", actor=user)
    assert event.entity_id == user.id
    assert event.clinic_id == user.clinic_id
    assert event.metadata == {"result": "success"}
    assert PASSWORD not in str(event.metadata)


@pytest.mark.django_db
def test_audit_metadata_strips_secret_keys(user):
    event = record_audit_event(
        actor=user,
        action="accounts.user_created",
        entity_type="accounts.User",
        entity_id=user.id,
        metadata={"result": "created", "password": "hidden", "nested": {"token": "hidden"}},
    )
    assert event.metadata == {"result": "created", "nested": {}}


@pytest.mark.django_db
def test_audit_events_are_append_only(user):
    event = record_audit_event(
        actor=user,
        action="accounts.user_created",
        entity_type="accounts.User",
        entity_id=user.id,
    )
    event.action = "changed"
    with pytest.raises(ValidationError):
        event.save()
    with pytest.raises(ValidationError):
        AuditEvent.objects.filter(pk=event.pk).update(action="changed")
    with pytest.raises(ValidationError):
        event.delete()
    with pytest.raises(ValidationError):
        AuditEvent.objects.all().delete()
    assert AuditEvent.objects.filter(pk=event.pk).exists()
