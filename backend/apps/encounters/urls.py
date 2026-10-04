from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.encounters.views import (
    ClinicalNoteViewSet,
    DiagnosisViewSet,
    EncounterViewSet,
    FollowUpViewSet,
    SymptomViewSet,
    TreatmentPlanViewSet,
    VitalSignViewSet,
    VitalUnitsView,
)

router = DefaultRouter()
router.register("encounters", EncounterViewSet, basename="encounter")


def _child(viewset, actions):
    return viewset.as_view(actions)


_list_actions = {"get": "list", "post": "create"}
_read_actions = {"get": "retrieve"}

urlpatterns = [
    path("vital-units/", VitalUnitsView.as_view(), name="vital-units"),
    path(
        "encounters/<uuid:encounter_id>/vitals/",
        _child(VitalSignViewSet, _list_actions),
        name="encounter-vital-list",
    ),
    path(
        "encounters/<uuid:encounter_id>/vitals/<uuid:pk>/",
        _child(VitalSignViewSet, _read_actions),
        name="encounter-vital-detail",
    ),
    path(
        "encounters/<uuid:encounter_id>/symptoms/",
        _child(SymptomViewSet, _list_actions),
        name="encounter-symptom-list",
    ),
    path(
        "encounters/<uuid:encounter_id>/symptoms/<uuid:pk>/",
        _child(SymptomViewSet, _read_actions),
        name="encounter-symptom-detail",
    ),
    path(
        "encounters/<uuid:encounter_id>/diagnoses/",
        _child(DiagnosisViewSet, _list_actions),
        name="encounter-diagnosis-list",
    ),
    path(
        "encounters/<uuid:encounter_id>/diagnoses/<uuid:pk>/",
        _child(DiagnosisViewSet, _read_actions),
        name="encounter-diagnosis-detail",
    ),
    path(
        "encounters/<uuid:encounter_id>/notes/",
        _child(ClinicalNoteViewSet, _list_actions),
        name="encounter-note-list",
    ),
    path(
        "encounters/<uuid:encounter_id>/notes/<uuid:pk>/",
        _child(ClinicalNoteViewSet, _read_actions),
        name="encounter-note-detail",
    ),
    path(
        "encounters/<uuid:encounter_id>/treatment-plans/",
        _child(TreatmentPlanViewSet, _list_actions),
        name="encounter-plan-list",
    ),
    path(
        "encounters/<uuid:encounter_id>/treatment-plans/<uuid:pk>/",
        _child(TreatmentPlanViewSet, _read_actions),
        name="encounter-plan-detail",
    ),
    path(
        "encounters/<uuid:encounter_id>/follow-ups/",
        _child(FollowUpViewSet, _list_actions),
        name="encounter-follow-up-list",
    ),
    path(
        "encounters/<uuid:encounter_id>/follow-ups/<uuid:pk>/",
        _child(FollowUpViewSet, _read_actions),
        name="encounter-follow-up-detail",
    ),
    *router.urls,
]
