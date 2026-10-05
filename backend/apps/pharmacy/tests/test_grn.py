from datetime import timedelta

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone

from apps.appointments.tests.test_scheduling import auth, grant
from testing import PASSWORD

PHARMACY = ("pharmacy.view", "pharmacy.manage")


@pytest.fixture
def manager(api_client, clinic, branch, user):
    grant(user, *PHARMACY)
    auth(api_client, user)
    return api_client


def _medicine(api, code="bulk-med"):
    category = api.post("/api/v1/medicine-categories/", {"name": "General", "code": f"cat-{code}"}, format="json")
    assert category.status_code == 201, category.data
    medicine = api.post(
        "/api/v1/medicines/",
        {
            "category": category.data["id"],
            "name": "Bulk Med",
            "code": code,
            "form": "tablet",
            "strength": "500mg",
            "unit": "tablet",
            "reorder_level": 0,
        },
        format="json",
    )
    assert medicine.status_code == 201, medicine.data
    return medicine.data


@pytest.mark.django_db
def test_bulk_stock_receive_creates_batches(manager, branch):
    api = manager
    medicine = _medicine(api, "receive-med")
    csv = SimpleUploadedFile(
        "stock.csv",
        (
            "medicine_code,batch_number,expiry_date,quantity\n"
            f"receive-med,RCV-001,{(timezone.now().date() + timedelta(days=400)).isoformat()},25\n"
        ).encode(),
        content_type="text/csv",
    )
    response = api.post(
        "/api/v1/stock-receive/bulk/",
        {"file": csv, "reference_number": "GRN-001"},
        format="multipart",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert response.status_code == 200, response.data
    assert response.data["created"] == 1
    assert response.data["errors"] == []

    batches = api.get(f"/api/v1/medicine-batches/?medicine={medicine['id']}")
    assert batches.status_code == 200
    assert batches.data["count"] == 1
    assert batches.data["results"][0]["quantity_on_hand"] == 25


@pytest.mark.django_db
def test_grn_post_receives_multiple_lines(manager, branch):
    api = manager
    medicine_a = _medicine(api, "grn-a")
    medicine_b = _medicine(api, "grn-b")
    expiry = (timezone.now().date() + timedelta(days=300)).isoformat()

    created = api.post(
        "/api/v1/goods-receipts/",
        {
            "reference_number": "GRN-100",
            "received_at": timezone.now().date().isoformat(),
        },
        format="json",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert created.status_code == 201, created.data
    grn_id = created.data["id"]

    line_a = api.post(
        f"/api/v1/goods-receipts/{grn_id}/lines/",
        {"medicine": medicine_a["id"], "batch_number": "GA-1", "expiry_date": expiry, "quantity": 10},
        format="json",
    )
    line_b = api.post(
        f"/api/v1/goods-receipts/{grn_id}/lines/",
        {"medicine": medicine_b["id"], "batch_number": "GB-1", "expiry_date": expiry, "quantity": 15},
        format="json",
    )
    assert line_a.status_code == 201, line_a.data
    assert line_b.status_code == 201, line_b.data

    posted = api.post(f"/api/v1/goods-receipts/{grn_id}/post/", format="json")
    assert posted.status_code == 200, posted.data
    assert posted.data["status"] == "posted"
    assert posted.data["line_count"] == 2
