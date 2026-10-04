from decimal import Decimal

import pytest
from django.core.exceptions import ValidationError
from apps.accounts.models import User
from apps.appointments.tests.test_scheduling import auth, grant, make_doctor, make_patient
from apps.billing.models import Invoice, Payment
from apps.billing.serializers import InvoiceItemWriteSerializer
from apps.billing.tests.test_visit import walk_visit
from testing import PASSWORD


def test_invoice_item_serializer_rejects_a_non_positive_quantity():
    serializer = InvoiceItemWriteSerializer(
        data={"kind": "consultation", "quantity": 0, "unit_price": "10.00"}
    )
    assert serializer.is_valid() is False
    assert "quantity" in serializer.errors


def test_invoice_item_serializer_rejects_a_consultation_tied_to_a_prescription():
    serializer = InvoiceItemWriteSerializer(
        data={
            "kind": "consultation",
            "quantity": 1,
            "unit_price": "10.00",
            "prescription_item": "11111111-1111-1111-1111-111111111111",
        }
    )
    assert serializer.is_valid() is False
    assert "prescription_item" in serializer.errors


@pytest.mark.django_db
def test_invoice_rows_cannot_be_deleted(api_client, clinic, branch, user):
    visit = walk_visit(api_client, clinic, branch, user)
    invoice = Invoice.objects.get(pk=visit["invoice_id"])
    with pytest.raises(ValidationError):
        invoice.delete()
    assert Invoice.objects.filter(pk=invoice.pk).exists()


@pytest.mark.django_db
def test_invoice_payments_list_is_paginated(api_client, clinic, branch, user):
    visit = walk_visit(api_client, clinic, branch, user)
    grant(user, "billing.view")
    auth(api_client, user)
    listed = api_client.get(f"/api/v1/invoices/{visit['invoice_id']}/payments/")
    assert listed.status_code == 200
    assert "results" in listed.data
    assert len(listed.data["results"]) == 1
    assert listed.data["results"][0]["amount"] == "45.00"
    assert listed.data["results"][0]["method_name"]
    assert listed.data["results"][0]["method_name"] != listed.data["results"][0]["method"]


@pytest.mark.django_db
def test_invoice_list_includes_patient_full_name(api_client, clinic, branch, user):
    visit = walk_visit(api_client, clinic, branch, user)
    grant(user, "billing.view")
    auth(api_client, user)
    listed = api_client.get("/api/v1/invoices/", HTTP_X_BRANCH_ID=str(branch.id))
    assert listed.status_code == 200
    row = next(item for item in listed.data["results"] if item["id"] == visit["invoice_id"])
    assert row["patient_full_name"] == "Lina Chart"
    assert row["patient_full_name"] != row["patient"]


@pytest.mark.django_db
def test_a_rejected_payment_does_not_change_the_invoice(api_client, clinic, branch, user):
    visit = walk_visit(api_client, clinic, branch, user, pay=False)
    api = api_client
    before = Payment.objects.count()
    refused = api.post(
        f"/api/v1/invoices/{visit['invoice_id']}/payments/",
        {"method": visit["method_id"], "amount": "9999.00"},
        format="json",
    )
    assert refused.status_code == 400
    assert "balance" in str(refused.data)
    assert Payment.objects.count() == before
    invoice = Invoice.objects.get(pk=visit["invoice_id"])
    assert invoice.status == "issued"
    assert invoice.total == Decimal("45.00")


@pytest.mark.django_db
def test_billing_permissions_do_not_imply_each_other(api_client, clinic, branch, user):
    visit = walk_visit(api_client, clinic, branch, user)
    viewer = User.objects.create_user(
        email="cashier-view@example.com",
        password=PASSWORD,
        full_name="Vera View",
        clinic=clinic,
    )
    grant(viewer, "billing.view")
    auth(api_client, viewer)
    listed = api_client.get("/api/v1/invoices/")
    assert listed.status_code == 200
    refused = api_client.post(
        f"/api/v1/invoices/{visit['invoice_id']}/payments/",
        {"method": visit["method_id"], "amount": "1.00"},
        format="json",
    )
    assert refused.status_code == 403

    payer = User.objects.create_user(
        email="cashier-pay@example.com",
        password=PASSWORD,
        full_name="Pam Pay",
        clinic=clinic,
    )
    grant(payer, "billing.payment", "billing.view")
    auth(api_client, payer)
    cannot_issue = api_client.post("/api/v1/invoices/", {"encounter": visit["encounter_id"]}, format="json")
    assert cannot_issue.status_code == 403


@pytest.mark.django_db
def test_invoice_is_hidden_from_another_clinic_and_branch(
    api_client, clinic, branch, other_branch, other_clinic, user
):
    visit = walk_visit(api_client, clinic, branch, user)
    outsider = User.objects.create_user(
        email="other-cashier@example.com",
        password=PASSWORD,
        full_name="Faye Foreign",
        clinic=other_clinic,
    )
    grant(outsider, "billing.view")
    auth(api_client, outsider)
    hidden = api_client.get(f"/api/v1/invoices/{visit['invoice_id']}/")
    assert hidden.status_code == 404

    grant(user, "billing.view", branch=other_branch)
    auth(api_client, user)
    wrong_branch = api_client.get(
        f"/api/v1/invoices/{visit['invoice_id']}/",
        HTTP_X_BRANCH_ID=str(other_branch.id),
    )
    assert wrong_branch.status_code == 404


@pytest.mark.django_db
def test_invoice_list_filters_by_status_and_open_for_payment(api_client, clinic, branch, user):
    visit = walk_visit(api_client, clinic, branch, user, pay=False)
    grant(user, "billing.view")
    auth(api_client, user)

    issued = api_client.get("/api/v1/invoices/", {"status": "issued"})
    assert issued.status_code == 200
    assert any(row["id"] == visit["invoice_id"] for row in issued.data["results"])

    open_only = api_client.get("/api/v1/invoices/", {"open_for_payment": "true"})
    assert open_only.status_code == 200
    assert any(row["id"] == visit["invoice_id"] for row in open_only.data["results"])

    paid = api_client.get("/api/v1/invoices/", {"status": "paid"})
    assert paid.status_code == 200
    assert not any(row["id"] == visit["invoice_id"] for row in paid.data["results"])


@pytest.mark.django_db
def test_manual_invoice_can_be_created_without_encounter(api_client, clinic, branch, user):
    patient = make_patient(branch)
    doctor = make_doctor(clinic, branch, email="manual-dr@example.com")
    grant(user, "billing.view", "billing.create")
    auth(api_client, user)
    header = {"HTTP_X_BRANCH_ID": str(branch.id)}

    created = api_client.post(
        "/api/v1/invoices/",
        {"patient": str(patient.id), "doctor": str(doctor.id)},
        format="json",
        **header,
    )
    assert created.status_code == 201, created.data
    assert str(created.data["patient"]) == str(patient.id)
    assert str(created.data["doctor"]) == str(doctor.id)
    assert created.data["encounter"] is None
    assert created.data["status"] == "draft"
    assert created.data["patient_full_name"] == patient.full_name

    item = api_client.post(
        f"/api/v1/invoices/{created.data['id']}/items/",
        {
            "kind": "consultation",
            "description": "Walk-in consultation",
            "quantity": 1,
            "unit_price": "15000.00",
        },
        format="json",
        **header,
    )
    assert item.status_code == 201, item.data
    assert item.data["description"] == "Walk-in consultation"

    issued = api_client.post(f"/api/v1/invoices/{created.data['id']}/issue/", **header)
    assert issued.status_code == 200, issued.data
    assert issued.data["status"] == "issued"
    assert Decimal(issued.data["total"]) == Decimal("15000.00")
