import pytest
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.clinics.models import Branch, Clinic
from testing import PASSWORD


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def clinic(db):
    return Clinic.objects.create(name="Main Clinic", code="main")


@pytest.fixture
def other_clinic(db):
    return Clinic.objects.create(name="Other Clinic", code="other")


@pytest.fixture
def branch(clinic):
    return Branch.objects.create(clinic=clinic, name="North", code="north")


@pytest.fixture
def other_branch(clinic):
    return Branch.objects.create(clinic=clinic, name="South", code="south")


@pytest.fixture
def user(clinic):
    return User.objects.create_user(
        email="nurse@example.com",
        password=PASSWORD,
        full_name="Nurse Example",
        clinic=clinic,
    )
