import pytest
from django.conf import settings
from django.core.cache import caches
from django.core.management import call_command
from django.test import override_settings

from apps.accounts.throttles import LoginRateThrottle
from apps.accounts.views import EmailTokenObtainPairView
from testing import PASSWORD


@pytest.mark.django_db
def test_health_reports_database_and_redis(api_client):
    response = api_client.get("/api/v1/health/")
    assert response.status_code == 200
    assert response.data["status"] == "ok"
    assert response.data["database"] == "ok"
    assert response.data["redis"] == "ok"


def test_unknown_api_version_is_rejected(api_client):
    response = api_client.get("/api/v2/health/")
    assert response.status_code == 404
    assert response.data["code"] == "not_found"
    assert response.data["fields"] == {}


def test_database_uses_postgresql():
    assert settings.DATABASES["default"]["ENGINE"] == "django.db.backends.postgresql"
    assert settings.AUTH_USER_MODEL == "accounts.User"


@pytest.mark.django_db
def test_model_changes_have_migrations():
    call_command("makemigrations", "--check", "--dry-run")


@pytest.mark.django_db
def test_login_validation_uses_error_envelope(api_client):
    response = api_client.post("/api/v1/auth/token/", {}, format="json")
    assert response.status_code == 400
    assert response.data["code"] == "validation_error"
    assert "email" in response.data["fields"]
    assert "password" in response.data["fields"]


@pytest.mark.django_db
def test_login_refresh_and_me(api_client, user):
    login = api_client.post(
        "/api/v1/auth/token/",
        {"email": user.email, "password": PASSWORD},
        format="json",
    )
    assert login.status_code == 200
    assert login.data["access"]
    assert login.data["refresh"]

    me = api_client.get(
        "/api/v1/auth/me/",
        HTTP_AUTHORIZATION=f"Bearer {login.data['access']}",
    )
    assert me.status_code == 200
    assert me.data["email"] == user.email
    assert me.data["clinic_id"] == str(user.clinic_id)
    assert me.data["clinic_timezone"] == "UTC"
    assert me.data["permissions"] == []
    assert me.data["is_superuser"] is False
    assert me.data["has_role_assignments"] is False
    assert me.data["requires_branch_selection"] is False
    assert me.data["access_block_reason"] == "no_role"
    assert me.data["assigned_branches"] == []

    refreshed = api_client.post(
        "/api/v1/auth/token/refresh/",
        {"refresh": login.data["refresh"]},
        format="json",
    )
    assert refreshed.status_code == 200
    assert refreshed.data["access"]

    reused = api_client.post(
        "/api/v1/auth/token/refresh/",
        {"refresh": login.data["refresh"]},
        format="json",
    )
    assert reused.status_code == 401
    assert reused.data["code"]


@pytest.mark.django_db
def test_me_requires_authentication(api_client):
    response = api_client.get("/api/v1/auth/me/")
    assert response.status_code == 401
    assert response.data["code"] == "not_authenticated"
    assert "password" not in response.data["detail"].lower()


@pytest.mark.django_db
def test_inactive_user_cannot_login(api_client, user):
    user.is_active = False
    user.save(update_fields=["is_active"])
    response = api_client.post(
        "/api/v1/auth/token/",
        {"email": user.email, "password": PASSWORD},
        format="json",
    )
    assert response.status_code == 401
    assert "access" not in response.data


@pytest.mark.django_db
def test_login_rate_limit_ignores_forwarded_for(api_client, user):
    assert EmailTokenObtainPairView.throttle_classes == [LoginRateThrottle]
    with override_settings(
        CACHES={
            "default": {
                "BACKEND": "django.core.cache.backends.locmem.LocMemCache",
                "LOCATION": "login-throttle",
            }
        }
    ):
        local_cache = caches["default"]
        local_cache.clear()
        previous_rates = LoginRateThrottle.THROTTLE_RATES
        previous_cache = LoginRateThrottle.cache
        LoginRateThrottle.THROTTLE_RATES = {"auth_login": "2/minute"}
        LoginRateThrottle.cache = local_cache
        try:
            body = {"email": user.email, "password": "wrong-password"}
            for index in range(2):
                response = api_client.post(
                    "/api/v1/auth/token/",
                    body,
                    format="json",
                    HTTP_X_FORWARDED_FOR=f"203.0.113.{index}",
                )
                assert response.status_code == 401, response.data
            blocked = api_client.post(
                "/api/v1/auth/token/",
                body,
                format="json",
                HTTP_X_FORWARDED_FOR="198.51.100.9",
            )
            assert blocked.status_code == 429
            assert blocked.data["code"] == "throttled"
        finally:
            LoginRateThrottle.THROTTLE_RATES = previous_rates
            LoginRateThrottle.cache = previous_cache
