import pytest

from apps.appointments.tests.test_scheduling import auth, grant
from apps.encounters.models import VitalSign
from apps.encounters.tests.test_triage import nurse


@pytest.mark.django_db
def test_clinic_vital_settings_can_be_updated(api_client, user, clinic):
    grant(user, "clinics.view", "clinics.manage", "encounters.view")
    auth(api_client, user)

    current = api_client.get("/api/v1/clinic-vital-settings/")
    assert current.status_code == 200, current.data
    assert current.data["units"]["temperature"] == "°C"

    updated = api_client.patch(
        "/api/v1/clinic-vital-settings/",
        {"units": {"temperature": "°F", "weight_kg": "lb"}},
        format="json",
    )
    assert updated.status_code == 200, updated.data
    assert updated.data["units"]["temperature"] == "°F"
    assert updated.data["units"]["weight_kg"] == "lb"

    units = api_client.get("/api/v1/vital-units/")
    assert units.status_code == 200, units.data
    by_field = {row["field"]: row["unit"] for row in units.data["fields"]}
    assert by_field["temperature"] == "°F"
    assert by_field["weight_kg"] == "lb"


@pytest.mark.django_db
def test_vitals_are_converted_to_storage_units(nurse):
    grant(nurse["user"], "clinics.manage")
    nurse["api"].patch(
        "/api/v1/clinic-vital-settings/",
        {"units": {"temperature": "°F"}},
        format="json",
    )

    triage = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/triage/start/")
    assert triage.status_code == 200, triage.data
    encounter_id = triage.data["encounter"]["id"]

    recorded = nurse["api"].post(
        f"/api/v1/encounters/{encounter_id}/vitals/",
        {"temperature": "98.6"},
        format="json",
    )
    assert recorded.status_code == 201, recorded.data

    vital = VitalSign.objects.get(encounter_id=encounter_id)
    assert float(vital.temperature) == pytest.approx(37.0, abs=0.2)


@pytest.mark.django_db
def test_weight_is_converted_to_storage_units(nurse):
    grant(nurse["user"], "clinics.manage")
    nurse["api"].patch(
        "/api/v1/clinic-vital-settings/",
        {"units": {"weight_kg": "lb"}},
        format="json",
    )

    triage = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/triage/start/")
    assert triage.status_code == 200, triage.data
    encounter_id = triage.data["encounter"]["id"]

    recorded = nurse["api"].post(
        f"/api/v1/encounters/{encounter_id}/vitals/",
        {"weight_kg": "180.5"},
        format="json",
    )
    assert recorded.status_code == 201, recorded.data

    vital = VitalSign.objects.get(encounter_id=encounter_id)
    assert float(vital.weight_kg) == pytest.approx(81.87, abs=0.05)
