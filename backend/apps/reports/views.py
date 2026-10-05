from django.http import HttpResponse
from rest_framework.renderers import BaseRenderer
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.admin_views import _require_clinic
from apps.accounts.permissions import BranchScopedPermission, extract_branch_id
from apps.reports.services import (
    build_clinical_report,
    build_financial_report,
    build_laboratory_report,
    build_operations_report,
    build_pharmacy_report,
    build_summary_report,
    build_trends_report,
    parse_report_range,
)
from apps.reports.services.ccr import build_ccr_report, render_ccr_pdf, render_ccr_xlsx
from apps.reports.services.csv_export import render_report_csv


class ReportsBaseView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "reports.view"

    def scope(self, request):
        clinic_id = _require_clinic(request.user)
        branch_id = extract_branch_id(request)
        start, end = parse_report_range(request.query_params, clinic_id=clinic_id)
        return clinic_id, branch_id, start, end


class ReportsSummaryView(ReportsBaseView):
    def get(self, request, **kwargs):
        clinic_id, branch_id, start, end = self.scope(request)
        return Response(build_summary_report(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end))


class ReportsFinancialView(ReportsBaseView):
    def get(self, request, **kwargs):
        clinic_id, branch_id, start, end = self.scope(request)
        return Response(build_financial_report(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end))


class ReportsOperationsView(ReportsBaseView):
    def get(self, request, **kwargs):
        clinic_id, branch_id, start, end = self.scope(request)
        return Response(build_operations_report(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end))


class ReportsTrendsView(ReportsBaseView):
    def get(self, request, **kwargs):
        clinic_id, branch_id, start, end = self.scope(request)
        return Response(build_trends_report(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end))


class ReportsClinicalView(ReportsBaseView):
    def get(self, request, **kwargs):
        clinic_id, branch_id, start, end = self.scope(request)
        return Response(build_clinical_report(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end))


class ReportsPharmacyView(ReportsBaseView):
    def get(self, request, **kwargs):
        clinic_id, branch_id, start, end = self.scope(request)
        return Response(build_pharmacy_report(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end))


class ReportsLaboratoryView(ReportsBaseView):
    def get(self, request, **kwargs):
        clinic_id, branch_id, start, end = self.scope(request)
        return Response(build_laboratory_report(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end))


class ReportsCcrView(ReportsBaseView):
    def get(self, request, **kwargs):
        clinic_id, branch_id, start, end = self.scope(request)
        return Response(build_ccr_report(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end))


class BinaryAttachmentRenderer(BaseRenderer):
    """Accept binary downloads without forcing JSON content negotiation."""

    media_type = "*/*"
    format = "bin"
    charset = None

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class ReportsCcrExportView(ReportsBaseView):
    renderer_classes = [BinaryAttachmentRenderer]

    def get(self, request, **kwargs):
        export_format = (request.query_params.get("export_format") or "xlsx").strip().lower()
        clinic_id, branch_id, start, end = self.scope(request)
        payload = build_ccr_report(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end)
        if export_format == "pdf":
            content = render_ccr_pdf(payload)
            response = HttpResponse(content, content_type="application/pdf")
            response["Content-Disposition"] = (
                f'attachment; filename="ccr-{start.isoformat()}-{end.isoformat()}.pdf"'
            )
            return response
        if export_format in {"xlsx", "excel"}:
            content = render_ccr_xlsx(payload)
            response = HttpResponse(
                content,
                content_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            )
            response["Content-Disposition"] = (
                f'attachment; filename="ccr-{start.isoformat()}-{end.isoformat()}.xlsx"'
            )
            return response
        from rest_framework.exceptions import ValidationError as DRFValidationError

        raise DRFValidationError({"export_format": "Use pdf or xlsx."})


class CsvAttachmentRenderer(BaseRenderer):
    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


class ReportsExportCsvView(ReportsBaseView):
    renderer_classes = [CsvAttachmentRenderer]

    BUILDERS = {
        "summary": build_summary_report,
        "financial": build_financial_report,
        "operations": build_operations_report,
        "clinical": build_clinical_report,
        "pharmacy": build_pharmacy_report,
        "laboratory": build_laboratory_report,
        "trends": build_trends_report,
    }

    def get(self, request, **kwargs):
        report = (request.query_params.get("report") or "summary").strip().lower()
        builder = self.BUILDERS.get(report)
        if builder is None:
            from rest_framework.exceptions import ValidationError as DRFValidationError

            raise DRFValidationError({"report": "Unknown report type."})

        clinic_id, branch_id, start, end = self.scope(request)
        payload = builder(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end)
        trends = None
        if report == "summary":
            trends = build_trends_report(clinic_id=clinic_id, branch_id=branch_id, start=start, end=end)
        content = render_report_csv(
            report,
            payload,
            trends=trends,
            clinic_id=clinic_id,
            branch_id=branch_id,
            start=start,
            end=end,
        )

        response = HttpResponse(content, content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="{report}-{start.isoformat()}-{end.isoformat()}.csv"'
        return response
