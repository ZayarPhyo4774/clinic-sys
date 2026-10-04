import pytest

from apps.appointments.tests.test_scheduling import auth, grant
from apps.encounters.vital_units import VITAL_UNIT_FIELDS


@pytest.mark.django_db
def test_vital_units_endpoint(api_client, user):
    assert api_client.get("/api/v1/vital-units/").status_code == 401

    grant(user, "encounters.view")
    auth(api_client, user)
    response = api_client.get("/api/v1/vital-units/")
    assert response.status_code == 200, response.data
    assert response.data["fields"] == list(VITAL_UNIT_FIELDS)
    assert response.data["fields"][0]["field"] == "temperature"
    assert response.data["fields"][0]["unit"] == "°C"
