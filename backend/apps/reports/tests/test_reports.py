import pytest
from django.utils import timezone

from apps.accounts.models import Permission, Role, UserRole
from testing import PASSWORD


def _grant(user, code: str, clinic, branch=None):
    permission = Permission.objects.get_or_create(code=code, defaults={"description": code})[0]
    role = Role.objects.create(clinic=clinic, name=code, code=code.replace(".", "_"))
    role.permissions.add(permission)
    UserRole.objects.create(user=user, role=role, branch=branch)


@pytest.fixture
def reports_user(clinic, branch):
    from apps.accounts.models import User

    user = User.objects.create_user(
        email="reports@example.com",
        password=PASSWORD,
        full_name="Reports User",
        clinic=clinic,
    )
    _grant(user, "reports.view", clinic, branch)
    return user


@pytest.mark.django_db
@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/reports/summary/",
        "/api/v1/reports/financial/",
        "/api/v1/reports/operations/",
        "/api/v1/reports/trends/",
        "/api/v1/reports/clinical/",
        "/api/v1/reports/pharmacy/",
        "/api/v1/reports/laboratory/",
    ],
)
def test_report_endpoints_require_permission(api_client, path, clinic, branch):
    response = api_client.get(path, HTTP_X_BRANCH_ID=str(branch.id))
    assert response.status_code == 401


@pytest.mark.django_db
@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/reports/summary/",
        "/api/v1/reports/financial/",
        "/api/v1/reports/operations/",
        "/api/v1/reports/trends/",
        "/api/v1/reports/clinical/",
        "/api/v1/reports/pharmacy/",
        "/api/v1/reports/laboratory/",
    ],
)
def test_report_endpoints_return_payload(api_client, reports_user, branch, path):
    api_client.force_authenticate(user=reports_user)
    today = timezone.localdate().isoformat()
    response = api_client.get(
        f"{path}?from={today}&to={today}",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert response.status_code == 200
    assert response.data["from"] == today
    assert response.data["to"] == today
    assert "currency" in response.data


@pytest.mark.django_db
def test_summary_includes_extended_metrics(api_client, reports_user, branch):
    api_client.force_authenticate(user=reports_user)
    today = timezone.localdate().isoformat()
    response = api_client.get(
        f"/api/v1/reports/summary/?date={today}",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert response.status_code == 200
    for key in [
        "patients_seen",
        "walk_in_count",
        "encounters_completed",
        "revenue_by_kind",
        "no_show_count",
        "cancellation_count",
        "manual_invoice_count",
    ]:
        assert key in response.data


@pytest.mark.django_db
def test_trends_includes_comparison(api_client, reports_user, branch):
    api_client.force_authenticate(user=reports_user)
    today = timezone.localdate()
    from datetime import timedelta

    start = (today - timedelta(days=6)).isoformat()
    end = today.isoformat()
    response = api_client.get(
        f"/api/v1/reports/trends/?from={start}&to={end}",
        HTTP_X_BRANCH_ID=str(branch.id),
    )
    assert response.status_code == 200
    assert len(response.data["series"]) == 7
    assert "comparison" in response.data
    assert "payments_collected" in response.data["comparison"]


@pytest.mark.django_db
@pytest.mark.parametrize(
    "report,heading",
    [
        ("summary", "Clinic activity summary"),
        ("financial", "Financial report"),
        ("operations", "Operations report"),
        ("clinical", "Clinical report"),
        ("pharmacy", "Pharmacy inventory report"),
        ("laboratory", "Laboratory report"),
        ("trends", "Activity trends"),
    ],
)
def test_export_csv(api_client, reports_user, branch, report, heading):
    api_client.force_authenticate(user=reports_user)
    today = timezone.localdate().isoformat()
    response = api_client.get(
        f"/api/v1/reports/export/?report={report}&date={today}",
        HTTP_X_BRANCH_ID=str(branch.id),
        HTTP_ACCEPT="text/csv",
    )
    assert response.status_code == 200
    body = response.content.decode("utf-8-sig")
    assert response["Content-Type"].startswith("text/csv")
    assert heading in body
    assert "Summary" in body
    assert "field,value" not in body
    assert "Metric,Value" in body


@pytest.mark.django_db
def test_pharmacy_csv_is_an_inventory_ledger(api_client, reports_user, branch):
    api_client.force_authenticate(user=reports_user)
    today = timezone.localdate().isoformat()
    response = api_client.get(
        f"/api/v1/reports/export/?report=pharmacy&date={today}",
        HTTP_X_BRANCH_ID=str(branch.id),
        HTTP_ACCEPT="text/csv",
    )
    body = response.content.decode("utf-8-sig")
    assert "Inventory ledger" in body
    assert "Opening balance" in body
    assert "Used" in body
    assert "Remaining balance" in body
    assert "Stock movements" in body


@pytest.mark.django_db
def test_ccr_export_endpoints(api_client, reports_user, branch):
    api_client.force_authenticate(user=reports_user)
    today = timezone.localdate().isoformat()

    xlsx = api_client.get(
        f"/api/v1/reports/ccr/export/?export_format=xlsx&date={today}",
        HTTP_X_BRANCH_ID=str(branch.id),
        HTTP_ACCEPT="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
    assert xlsx.status_code == 200, xlsx.content[:200]
    assert xlsx["Content-Type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    pdf = api_client.get(
        f"/api/v1/reports/ccr/export/?export_format=pdf&date={today}",
        HTTP_X_BRANCH_ID=str(branch.id),
        HTTP_ACCEPT="application/pdf",
    )
    assert pdf.status_code == 200, pdf.content[:200]
    assert pdf["Content-Type"] == "application/pdf"


@pytest.mark.django_db
def test_export_csv_accepts_text_csv_header(api_client, reports_user, branch):
    api_client.force_authenticate(user=reports_user)
    today = timezone.localdate().isoformat()
    response = api_client.get(
        f"/api/v1/reports/export/?report=summary&date={today}",
        HTTP_X_BRANCH_ID=str(branch.id),
        HTTP_ACCEPT="text/csv",
    )
    assert response.status_code == 200
    body = response.content.decode("utf-8-sig")
    assert response["Content-Type"].startswith("text/csv")
    assert "Clinic activity summary" in body
    assert "Daily activity" in body
