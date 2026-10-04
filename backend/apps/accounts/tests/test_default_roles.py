import pytest

from apps.accounts.default_roles import DEFAULT_ROLE_TEMPLATES, ensure_permission_catalog, install_default_roles
from apps.accounts.models import Role
from apps.clinics.models import Clinic


def _template(code: str):
    return next(item for item in DEFAULT_ROLE_TEMPLATES if item.code == code)


@pytest.mark.django_db
def test_solo_practitioner_role_covers_solo_clinic_workflow():
    template = _template("solo-practitioner")
    permissions = set(template.permissions)

    assert "patients.create" in permissions
    assert "appointments.update" in permissions
    assert "encounters.create" in permissions
    assert "prescriptions.create" in permissions
    assert "pharmacy.manage" in permissions
    assert "billing.payment" in permissions
    assert "users.manage" not in permissions
    assert "roles.manage" not in permissions


@pytest.mark.django_db
def test_install_default_roles_includes_solo_practitioner():
    ensure_permission_catalog()
    clinic = Clinic.objects.create(name="Solo Clinic", code="solo", timezone="UTC", currency="USD")
    result = install_default_roles(clinic)

    assert result["created"] >= 1
    role = Role.objects.get(clinic=clinic, code="solo-practitioner")
    assert role.name == "Solo Practitioner"
    assert role.permissions.filter(code="billing.payment").exists()
