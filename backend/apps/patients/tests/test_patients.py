import uuid

import pytest
from django.core.exceptions import ValidationError

from apps.accounts.models import Permission, Role, User, UserRole
from apps.audit.models import AuditEvent
from apps.clinics.models import Branch
from apps.patients.models import Patient, PatientAllergy, PatientMedicalHistory
from testing import PASSWORD


def grant(user, *codes, branch=None):
    permissions = [
        Permission.objects.get_or_create(code=code, defaults={"description": code})[0] for code in codes
    ]
    role = Role.objects.create(clinic=user.clinic, name="Patients", code=f"pat-{uuid.uuid4().hex[:8]}")
    role.permissions.add(*permissions)
    UserRole.objects.create(user=user, role=role, branch=branch)
    return user


def auth(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def clerk(user):
    return grant(user, "patients.view", "patients.create", "patients.update", "patients.delete")


def register(api_client, branch, name="Lina Chart"):
    return api_client.post(
        "/api/v1/patients/",
        {
            "branch": str(branch.id),
            "full_name": name,
            "date_of_birth": "1985-04-12",
            "sex": "female",
        },
        format="json",
    )


@pytest.mark.django_db
def test_create_patient_assigns_number_and_audits_without_clinical_text(api_client, clerk, branch):
    auth(api_client, clerk)
    response = register(api_client, branch)
    assert response.status_code == 201
    assert response.data["patient_number"] == "000001"
    assert response.data["version"] == 1
    assert str(response.data["clinic"]) == str(clerk.clinic_id)
    assert str(response.data["created_by"]) == str(clerk.id)

    second = register(api_client, branch, name="Other Person")
    assert second.status_code == 201
    assert second.data["patient_number"] == "000002"

    event = AuditEvent.objects.get(action="patients.patient_created", entity_id=response.data["id"])
    assert event.metadata == {"result": "created"}
    assert "Lina Chart" not in str(event.metadata)
    assert "1985-04-12" not in str(event.metadata)


@pytest.mark.django_db
def test_update_patient_checks_version(api_client, clerk, branch):
    auth(api_client, clerk)
    created = register(api_client, branch)
    patient_id = created.data["id"]
    updated = api_client.patch(
        f"/api/v1/patients/{patient_id}/",
        {"full_name": "Lina Updated", "version": 1},
        format="json",
    )
    assert updated.status_code == 200
    assert updated.data["full_name"] == "Lina Updated"
    assert updated.data["version"] == 2
    event = AuditEvent.objects.get(action="patients.patient_updated")
    assert "Lina" not in str(event.metadata)

    stale = api_client.patch(
        f"/api/v1/patients/{patient_id}/",
        {"full_name": "Ignored", "version": 1},
        format="json",
    )
    assert stale.status_code == 409
    assert stale.data["code"] == "conflict"
    assert Patient.objects.get(pk=patient_id).full_name == "Lina Updated"


@pytest.mark.django_db
def test_search_patient_by_name_and_number(api_client, clerk, branch):
    auth(api_client, clerk)
    created = register(api_client, branch, name="Lina Chart")
    register(api_client, branch, name="Omar West")
    by_name = api_client.get("/api/v1/patients/?search=Lina")
    assert by_name.status_code == 200
    assert by_name.data["count"] == 1
    assert by_name.data["results"][0]["patient_number"] == "000001"
    by_number = api_client.get("/api/v1/patients/?search=000002")
    assert [row["full_name"] for row in by_number.data["results"]] == ["Omar West"]
    filtered = api_client.get(f"/api/v1/patients/?sex=female&branch={branch.id}")
    assert filtered.data["count"] == 2
    assert created.data["id"] in {row["id"] for row in filtered.data["results"]}


@pytest.mark.django_db
def test_unauthorized_access_is_rejected(api_client, user, branch):
    anonymous = api_client.get("/api/v1/patients/")
    assert anonymous.status_code == 401
    assert anonymous.data["code"] == "not_authenticated"

    auth(api_client, user)
    forbidden = api_client.get("/api/v1/patients/")
    assert forbidden.status_code == 403
    assert forbidden.data["code"] == "permission_denied"
    create_forbidden = register(api_client, branch)
    assert create_forbidden.status_code == 403


@pytest.mark.django_db
def test_clinic_isolation_hides_other_clinic_patients(api_client, clerk, branch, other_clinic):
    auth(api_client, clerk)
    created = register(api_client, branch, name="Hidden Chart")
    outsider = User.objects.create_user(
        email="other-clerk@example.com",
        password=PASSWORD,
        full_name="Other Clerk",
        clinic=other_clinic,
    )
    grant(outsider, "patients.view", "patients.create", "patients.update", "patients.delete")
    auth(api_client, outsider)
    listing = api_client.get("/api/v1/patients/?search=Hidden")
    assert listing.status_code == 200
    assert listing.data["count"] == 0
    detail = api_client.get(f"/api/v1/patients/{created.data['id']}/")
    assert detail.status_code == 404
    profile = api_client.get(f"/api/v1/patients/{created.data['id']}/profile/")
    assert profile.status_code == 404
    assert "Hidden Chart" not in str(detail.data)


@pytest.mark.django_db
def test_role_permissions_split_view_create_update_and_delete(api_client, clinic, branch):
    viewer = grant(
        User.objects.create_user(
            email="viewer@example.com",
            password=PASSWORD,
            full_name="Viewer",
            clinic=clinic,
        ),
        "patients.view",
    )
    creator = grant(
        User.objects.create_user(
            email="creator@example.com",
            password=PASSWORD,
            full_name="Creator",
            clinic=clinic,
        ),
        "patients.create",
    )
    editor = grant(
        User.objects.create_user(
            email="editor@example.com",
            password=PASSWORD,
            full_name="Editor",
            clinic=clinic,
        ),
        "patients.update",
    )
    remover = grant(
        User.objects.create_user(
            email="remover@example.com",
            password=PASSWORD,
            full_name="Remover",
            clinic=clinic,
        ),
        "patients.delete",
    )

    auth(api_client, viewer)
    assert api_client.get("/api/v1/patients/").status_code == 200
    assert register(api_client, branch).status_code == 403

    auth(api_client, creator)
    created = register(api_client, branch, name="Created Chart")
    assert created.status_code == 201
    assert api_client.get("/api/v1/patients/").status_code == 403
    assert (
        api_client.patch(
            f"/api/v1/patients/{created.data['id']}/",
            {"full_name": "Nope", "version": 1},
            format="json",
        ).status_code
        == 403
    )

    auth(api_client, editor)
    updated = api_client.patch(
        f"/api/v1/patients/{created.data['id']}/",
        {"full_name": "Edited Chart", "version": 1},
        format="json",
    )
    assert updated.status_code == 200
    assert register(api_client, branch, name="Editor Create").status_code == 403

    auth(api_client, remover)
    assert api_client.get("/api/v1/patients/").status_code == 403
    removed = api_client.delete(f"/api/v1/patients/{created.data['id']}/")
    assert removed.status_code == 200
    assert removed.data["is_active"] is False
    assert Patient.objects.get(pk=created.data["id"]).is_active is False
    assert AuditEvent.objects.filter(action="patients.patient_deactivated").exists()


@pytest.mark.django_db
def test_branch_scoped_role_cannot_see_another_branch(api_client, clinic, branch, other_branch):
    north_user = grant(
        User.objects.create_user(
            email="north@example.com",
            password=PASSWORD,
            full_name="North User",
            clinic=clinic,
        ),
        "patients.view",
        "patients.create",
        branch=branch,
    )
    auth(api_client, north_user)
    created = api_client.post(
        "/api/v1/patients/",
        {
            "full_name": "North Patient",
            "date_of_birth": "1991-02-02",
            "sex": "male",
        },
        format="json",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert created.status_code == 201
    assert str(created.data["branch"]) == str(branch.id)

    south = api_client.get("/api/v1/patients/", HTTP_X_BRANCH_ID=str(other_branch.id))
    assert south.status_code == 403
    without_header = api_client.get("/api/v1/patients/")
    assert without_header.status_code == 403


@pytest.mark.django_db
def test_allergy_and_history_are_corrected_not_overwritten(api_client, clerk, branch):
    auth(api_client, clerk)
    patient = register(api_client, branch)
    patient_id = patient.data["id"]
    allergy = api_client.post(
        f"/api/v1/patients/{patient_id}/allergies/",
        {"substance": "Penicillin", "reaction": "Rash", "severity": "moderate"},
        format="json",
    )
    assert allergy.status_code == 201
    corrected = api_client.post(
        f"/api/v1/patients/{patient_id}/allergies/",
        {"substance": "Amoxicillin", "supersedes": allergy.data["id"]},
        format="json",
    )
    assert corrected.status_code == 201
    original = PatientAllergy.objects.get(pk=allergy.data["id"])
    assert original.substance == "Penicillin"
    assert original.status == PatientAllergy.Status.CORRECTED
    assert PatientAllergy.objects.get(pk=corrected.data["id"]).substance == "Amoxicillin"
    audit = AuditEvent.objects.get(action="patients.allergy_created", entity_id=allergy.data["id"])
    assert "Penicillin" not in str(audit.metadata)

    history = api_client.post(
        f"/api/v1/patients/{patient_id}/medical-history/",
        {"title": "Asthma", "details": "Childhood onset"},
        format="json",
    )
    assert history.status_code == 201
    replacement = api_client.post(
        f"/api/v1/patients/{patient_id}/medical-history/",
        {"title": "Asthma, mild", "supersedes": history.data["id"]},
        format="json",
    )
    assert replacement.status_code == 201
    assert PatientMedicalHistory.objects.get(pk=history.data["id"]).details == "Childhood onset"
    history_audit = AuditEvent.objects.get(action="patients.history_created", entity_id=history.data["id"])
    assert "Asthma" not in str(history_audit.metadata)
    assert "Childhood" not in str(history_audit.metadata)

    profile = api_client.get(f"/api/v1/patients/{patient_id}/profile/")
    assert profile.status_code == 200
    assert len(profile.data["allergies"]) == 2
    assert len(profile.data["medical_history"]) == 2

    with pytest.raises(ValidationError):
        PatientAllergy.objects.all().delete()


@pytest.mark.django_db
def test_document_metadata_and_contact_do_not_enter_the_audit_payload(api_client, clerk, branch):
    auth(api_client, clerk)
    patient = register(api_client, branch)
    patient_id = patient.data["id"]
    contact = api_client.post(
        f"/api/v1/patients/{patient_id}/contacts/",
        {"kind": "phone", "value": "555-0100", "is_primary": True},
        format="json",
    )
    assert contact.status_code == 201
    document = api_client.post(
        f"/api/v1/patients/{patient_id}/documents/",
        {
            "title": "Consent form",
            "document_type": "consent",
            "file_name": "consent.pdf",
            "content_type": "application/pdf",
            "storage_key": f"patients/{patient_id}/consent.pdf",
        },
        format="json",
    )
    assert document.status_code == 201
    changed = api_client.patch(
        f"/api/v1/patients/{patient_id}/documents/{document.data['id']}/",
        {"title": "Signed consent"},
        format="json",
    )
    assert changed.status_code == 200
    stored = " ".join(str(row) for row in AuditEvent.objects.values_list("metadata", flat=True))
    for secret in ("555-0100", "Consent form", "Signed consent", "consent.pdf"):
        assert secret not in stored
    foreign = Branch.objects.create(clinic=clerk.clinic, name="Closed", code="closed", is_active=False)
    inactive = api_client.post(
        "/api/v1/patients/",
        {
            "branch": str(foreign.id),
            "full_name": "Closed Branch",
            "date_of_birth": "2000-01-01",
            "sex": "unknown",
        },
        format="json",
    )
    assert inactive.status_code == 400
    assert "branch" in inactive.data["fields"]
