from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.patients.views import (
    PatientAddressViewSet,
    PatientAllergyViewSet,
    PatientContactViewSet,
    PatientDocumentViewSet,
    PatientMedicalHistoryViewSet,
    PatientViewSet,
)

router = DefaultRouter()
router.register("patients", PatientViewSet, basename="patient")

def _child(viewset, actions):
    return viewset.as_view(actions)


_list_actions = {"get": "list", "post": "create"}
_detail_actions = {"get": "retrieve", "put": "update", "patch": "partial_update"}
_read_actions = {"get": "retrieve"}
_append_actions = {"get": "list", "post": "create"}

urlpatterns = [
    path(
        "patients/<uuid:patient_id>/contacts/",
        _child(PatientContactViewSet, _list_actions),
        name="patient-contact-list",
    ),
    path(
        "patients/<uuid:patient_id>/contacts/<uuid:pk>/",
        _child(PatientContactViewSet, _detail_actions),
        name="patient-contact-detail",
    ),
    path(
        "patients/<uuid:patient_id>/addresses/",
        _child(PatientAddressViewSet, _list_actions),
        name="patient-address-list",
    ),
    path(
        "patients/<uuid:patient_id>/addresses/<uuid:pk>/",
        _child(PatientAddressViewSet, _detail_actions),
        name="patient-address-detail",
    ),
    path(
        "patients/<uuid:patient_id>/allergies/",
        _child(PatientAllergyViewSet, _append_actions),
        name="patient-allergy-list",
    ),
    path(
        "patients/<uuid:patient_id>/allergies/<uuid:pk>/",
        _child(PatientAllergyViewSet, _read_actions),
        name="patient-allergy-detail",
    ),
    path(
        "patients/<uuid:patient_id>/medical-history/",
        _child(PatientMedicalHistoryViewSet, _append_actions),
        name="patient-history-list",
    ),
    path(
        "patients/<uuid:patient_id>/medical-history/<uuid:pk>/",
        _child(PatientMedicalHistoryViewSet, _read_actions),
        name="patient-history-detail",
    ),
    path(
        "patients/<uuid:patient_id>/documents/",
        _child(PatientDocumentViewSet, _list_actions),
        name="patient-document-list",
    ),
    path(
        "patients/<uuid:patient_id>/documents/<uuid:pk>/",
        _child(PatientDocumentViewSet, _detail_actions),
        name="patient-document-detail",
    ),
    path(
        "patients/<uuid:patient_id>/documents/<uuid:pk>/file/",
        _child(PatientDocumentViewSet, {"get": "file"}),
        name="patient-document-file",
    ),
    *router.urls,
]
