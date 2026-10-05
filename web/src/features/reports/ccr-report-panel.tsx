"use client";

import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { QueryState, describeError } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { downloadCcrExport, type ReportRange, rangeQueryParams } from "@/features/reports/report-utils";
import { useAuth } from "@/features/auth/auth-provider";
import { api, withQuery } from "@/lib/api/client";
import type { CcrReport } from "@/lib/api/types";

function markCheckbox(checked: boolean) {
  return checked ? "☑" : "☐";
}

function populationTypesLabel(header: CcrReport["header"]) {
  return (
    <>
      Types:{" "}
      <span className="whitespace-nowrap">
        {markCheckbox(header.population_type === "host")} Host
      </span>{" "}
      <span className="whitespace-nowrap">
        {markCheckbox(header.population_type === "idps")} IDPs
      </span>
    </>
  );
}

function idpLocationsLabel(header: CcrReport["header"]) {
  return (
    <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
      <span className="whitespace-nowrap">{markCheckbox(header.idp_location === "forest")} Forest</span>
      <span className="whitespace-nowrap">{markCheckbox(header.idp_location === "monastery")} Monastery</span>
      <span className="whitespace-nowrap">{markCheckbox(header.idp_location === "school")} School</span>
      <span className="whitespace-nowrap">{markCheckbox(header.idp_location === "other")} Other......</span>
    </span>
  );
}

function paddedRows(report: CcrReport) {
  const rows = [...report.rows];
  while (rows.length < 15) {
    rows.push({
      no: rows.length + 1,
      name: "",
      age: "",
      gender: "",
      diagnosis: "",
      treatment: "",
      plw: "",
      disabled: "",
      disability_type_number: "",
      status_old: "",
      status_new: "",
      referral: "",
      referral_cause: "",
      remark: "",
    });
  }
  return rows;
}

export function CcrReportPanel({ range }: { range: ReportRange }) {
  const { branchId } = useAuth();
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const queryParams = rangeQueryParams(range);

  const query = useQuery({
    queryKey: ["reports", "ccr", range, branchId],
    queryFn: () => api<CcrReport>(withQuery("/reports/ccr/", queryParams)),
  });

  async function handleExport(format: "xlsx" | "pdf") {
    setExporting(format);
    try {
      await downloadCcrExport(format, queryParams);
      toast.success(format === "pdf" ? "CCR PDF downloaded." : "CCR Excel downloaded.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }

  if (query.isLoading) {
    return <QueryState status="loading" />;
  }
  if (query.isError) {
    return (
      <QueryState status="error" detail={describeError(query.error)} onRetry={() => void query.refetch()} />
    );
  }

  const report = query.data;
  if (!report) {
    return <QueryState status="empty" detail="No CCR data for this period." />;
  }

  const rows = paddedRows(report);
  const reportDate = report.header.report_date_formatted || report.header.report_date;

  return (
    <Card className="shadow-premium-sm">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Clinical Consultation Record (CCR)</CardTitle>
          <CardDescription>
            {report.header.project_name || "Project"} · {report.header.state_region || "State/Region"} ·{" "}
            {report.row_count} completed consultation{report.row_count === 1 ? "" : "s"}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={exporting !== null} onClick={() => void handleExport("xlsx")}>
            <Download className="mr-2 size-4" aria-hidden="true" />
            {exporting === "xlsx" ? "Exporting…" : "Excel"}
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={exporting !== null} onClick={() => void handleExport("pdf")}>
            <Download className="mr-2 size-4" aria-hidden="true" />
            {exporting === "pdf" ? "Exporting…" : "PDF"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <div className="min-w-[960px] border border-border bg-background p-4 text-xs">
          <div className="relative mb-3">
            <h3 className="text-center text-sm font-semibold">{report.header.title}</h3>
            <div className="absolute right-0 top-0 text-right leading-5">
              <div>Page: 1</div>
              <div>Date: {reportDate}</div>
            </div>
          </div>

          <div className="mb-3 grid gap-1 md:grid-cols-3">
            <div>Project Name: {report.header.project_name}</div>
            <div>Township (MIMU): {report.header.township_mimu}</div>
            <div>{populationTypesLabel(report.header)}</div>
            <div>State/Region: {report.header.state_region}</div>
            <div>Village Name (MIMU): {report.header.village_mimu}</div>
            <div>{idpLocationsLabel(report.header)}</div>
          </div>

          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border px-2 py-2 text-center" rowSpan={2}>No.</th>
                <th className="border px-2 py-2 text-left" rowSpan={2}>Name</th>
                <th className="border px-2 py-2 text-center" rowSpan={2}>Age</th>
                <th className="border px-2 py-2 text-center" rowSpan={2}>Gender</th>
                <th className="border px-2 py-2 text-left" rowSpan={2}>Diagnosis</th>
                <th className="border px-2 py-2 text-left" rowSpan={2}>Treatment</th>
                <th className="border px-2 py-2 text-center" colSpan={2}>Vulnerability</th>
                <th className="border px-2 py-2 text-center" colSpan={2}>Status</th>
                <th className="border px-2 py-2 text-center" rowSpan={2}>Referral (✓)</th>
                <th className="border px-2 py-2 text-left" rowSpan={2}>Cause of Referral</th>
                <th className="border px-2 py-2 text-left" rowSpan={2}>Remark</th>
              </tr>
              <tr>
                <th className="border px-2 py-1 text-center">PLW</th>
                <th className="border px-2 py-1 text-center">D</th>
                <th className="border px-2 py-1 text-center">Old</th>
                <th className="border px-2 py-1 text-center">New</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.no} className="align-top">
                  <td className="border px-2 py-2 text-center">{row.no}</td>
                  <td className="border px-2 py-2">{row.name}</td>
                  <td className="border px-2 py-2 text-center">{row.age}</td>
                  <td className="border px-2 py-2 text-center">{row.gender}</td>
                  <td className="border px-2 py-2">{row.diagnosis}</td>
                  <td className="border px-2 py-2">{row.treatment}</td>
                  <td className="border px-2 py-2 text-center">{row.plw}</td>
                  <td className="border px-2 py-2 text-center">
                    {row.disabled}
                    {row.disability_type_number ? ` ${row.disability_type_number}` : ""}
                  </td>
                  <td className="border px-2 py-2 text-center">{row.status_old}</td>
                  <td className="border px-2 py-2 text-center">{row.status_new}</td>
                  <td className="border px-2 py-2 text-center">{row.referral}</td>
                  <td className="border px-2 py-2">{row.referral_cause}</td>
                  <td className="border px-2 py-2">{row.remark}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <div className="space-y-1">
              <div>PLW - Pregnant and Lactating Women</div>
              <div>D - Disable</div>
              <div>
                Types of disability -{" "}
                {report.disability_types.map((item) => `${item.sort_order}. ${item.label}`).join(", ")}
              </div>
            </div>
            <div className="space-y-1 md:text-right">
              <div>Signature: _________________________</div>
              <div>Consultant Name: {report.header.consultant_name}</div>
              <div>Position: {report.header.consultant_position}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
