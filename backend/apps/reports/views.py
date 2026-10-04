import csv
import io

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


class ReportsBaseView(APIView):
    permission_classes = [BranchScopedPermission]
    required_permission = "reports.view"

    def scope(self, request):
        clinic_id = _require_clinic(request.user)
        branch_id = extract_branch_id(request)
        start, end = parse_report_range(request.query_params)
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


class CsvAttachmentRenderer(BaseRenderer):
    media_type = "text/csv"
    format = "csv"
    charset = "utf-8"

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data


def _flatten_report_rows(prefix: str, value, rows: list[list[object]]) -> None:
    if isinstance(value, dict):
        for sub_key, sub_value in value.items():
            _flatten_report_rows(f"{prefix}.{sub_key}" if prefix else sub_key, sub_value, rows)
        return
    if isinstance(value, list):
        rows.append([prefix, f"{len(value)} rows"])
        for index, row in enumerate(value):
            if isinstance(row, dict):
                for sub_key, sub_value in row.items():
                    _flatten_report_rows(f"{prefix}[{index}].{sub_key}", sub_value, rows)
            else:
                rows.append([f"{prefix}[{index}]", row])
        return
    rows.append([prefix, value])


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

        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(["field", "value"])
        rows: list[list[object]] = []
        for key, value in payload.items():
            _flatten_report_rows(key, value, rows)
        writer.writerows(rows)

        response = HttpResponse(buffer.getvalue(), content_type="text/csv")
        response["Content-Disposition"] = f'attachment; filename="{report}-{start.isoformat()}-{end.isoformat()}.csv"'
        return response
