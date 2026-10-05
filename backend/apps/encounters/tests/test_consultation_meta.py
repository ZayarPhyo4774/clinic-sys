import pytest

from apps.appointments.tests.test_scheduling import auth, grant
from apps.encounters.tests.test_triage import nurse


@pytest.mark.django_db
def test_consultation_meta_can_be_patched(nurse):
    grant(nurse["user"], "encounters.create")
    triage = nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/triage/start/")
    encounter_id = triage.data["encounter"]["id"]
    assert nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/call/").status_code == 200
    assert nurse["api"].post(f"/api/v1/queue-entries/{nurse['entry_id']}/start/").status_code == 200

    updated = nurse["api"].patch(
        f"/api/v1/encounters/{encounter_id}/consultation-meta/",
        {
            "patient_status": "new",
            "is_plw": True,
            "is_disabled": False,
            "referral_made": False,
            "treatment": "Rest and fluids",
            "remark": "Stable",
        },
        format="json",
    )
    assert updated.status_code == 200, updated.data
    assert updated.data["patient_status"] == "new"
    assert updated.data["is_plw"] is True
    assert updated.data["treatment"] == "Rest and fluids"

    loaded = nurse["api"].get(f"/api/v1/encounters/{encounter_id}/consultation-meta/")
    assert loaded.status_code == 200, loaded.data
    assert loaded.data["remark"] == "Stable"
