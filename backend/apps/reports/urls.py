from django.urls import path

from apps.reports.views import (
    ReportsCcrExportView,
    ReportsCcrView,
    ReportsClinicalView,
    ReportsExportCsvView,
    ReportsFinancialView,
    ReportsLaboratoryView,
    ReportsOperationsView,
    ReportsPharmacyView,
    ReportsSummaryView,
    ReportsTrendsView,
)

urlpatterns = [
    path("reports/summary/", ReportsSummaryView.as_view(), name="reports-summary"),
    path("reports/financial/", ReportsFinancialView.as_view(), name="reports-financial"),
    path("reports/operations/", ReportsOperationsView.as_view(), name="reports-operations"),
    path("reports/trends/", ReportsTrendsView.as_view(), name="reports-trends"),
    path("reports/clinical/", ReportsClinicalView.as_view(), name="reports-clinical"),
    path("reports/pharmacy/", ReportsPharmacyView.as_view(), name="reports-pharmacy"),
    path("reports/laboratory/", ReportsLaboratoryView.as_view(), name="reports-laboratory"),
    path("reports/export/", ReportsExportCsvView.as_view(), name="reports-export"),
    path("reports/ccr/", ReportsCcrView.as_view(), name="reports-ccr"),
    path("reports/ccr/export/", ReportsCcrExportView.as_view(), name="reports-ccr-export"),
]
