"use client";

import { Download, Upload } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import { FormError } from "@/components/form-field-error";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { allowed } from "@/features/access/navigation";
import { useAuth } from "@/features/auth/auth-provider";
import { apiUpload } from "@/lib/api/client";
import type { MedicineBulkImportResult } from "@/lib/api/types";
import { isOnline } from "@/offline/connectivity/network";
import { requireOnlineMutation } from "@/offline/sync/policy";

const TEMPLATE_HEADERS = [
  "category_code",
  "category_name",
  "name",
  "code",
  "form",
  "strength",
  "unit",
  "reorder_level",
  "is_active",
] as const;

const TEMPLATE_SAMPLE = [
  "antibiotics",
  "Antibiotics",
  "Amoxicillin",
  "amoxicillin-500",
  "capsule",
  "500mg",
  "capsule",
  "40",
  "true",
];

function downloadTemplate() {
  const lines = [TEMPLATE_HEADERS.join(","), TEMPLATE_SAMPLE.join(",")];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "medicine-import-template.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function MedicineBulkImport() {
  const { account } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [createMissingCategories, setCreateMissingCategories] = useState(true);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [result, setResult] = useState<MedicineBulkImportResult | null>(null);
  const [error, setError] = useState<unknown>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => {
      requireOnlineMutation("pharmacy.bulk_import_medicines", isOnline());
      const formData = new FormData();
      formData.append("file", file);
      formData.append("create_missing_categories", createMissingCategories ? "true" : "false");
      formData.append("skip_duplicates", skipDuplicates ? "true" : "false");
      return apiUpload<MedicineBulkImportResult>("/medicines/bulk-import/", formData);
    },
    onSuccess: async (payload) => {
      setResult(payload);
      setError(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await queryClient.invalidateQueries({ queryKey: ["medicines"] });
      await queryClient.invalidateQueries({ queryKey: ["medicine-categories"] });
      if (payload.created > 0) {
        toast.success(
          `${payload.created} medicine${payload.created === 1 ? "" : "s"} imported${
            payload.categories_created
              ? ` · ${payload.categories_created} categor${payload.categories_created === 1 ? "y" : "ies"} created`
              : ""
          }${payload.skipped ? ` · ${payload.skipped} skipped` : ""}.`,
        );
      } else if (payload.skipped > 0) {
        toast.message("No new medicines imported.", {
          description: `${payload.skipped} duplicate code${payload.skipped === 1 ? "" : "s"} skipped.`,
        });
      } else {
        toast.error("Import finished with no medicines created.");
      }
    },
    onError: (caught) => {
      setResult(null);
      setError(caught);
    },
  });

  if (!account || !allowed(account.permissions, "pharmacy.manage")) {
    return null;
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setError(null);
    setResult(null);
    mutation.mutate(file);
  }

  return (
    <Card className="shadow-premium-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="size-5 text-primary" aria-hidden="true" />
          Bulk upload medicines
        </CardTitle>
        <CardDescription>
          Import many catalog entries from CSV. Categories can be created automatically when missing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
            <Download className="mr-2 size-4" aria-hidden="true" />
            Download template
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={mutation.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            {mutation.isPending ? "Uploading…" : "Upload CSV"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={createMissingCategories}
              onChange={(event) => setCreateMissingCategories(event.target.checked)}
            />
            <span className="space-y-1">
              <span className="block font-medium">Create missing categories</span>
              <span className="block text-xs text-muted-foreground">
                Uses category_name when a category_code is not found in your clinic catalog.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={skipDuplicates}
              onChange={(event) => setSkipDuplicates(event.target.checked)}
            />
            <span className="space-y-1">
              <span className="block font-medium">Skip duplicate codes</span>
              <span className="block text-xs text-muted-foreground">
                Existing medicine codes are skipped instead of failing the whole upload.
              </span>
            </span>
          </label>
        </div>

        <div className="text-xs text-muted-foreground">
          Required columns: category_code (or category), name, code, form, strength, unit. Optional: category_name,
          reorder_level, is_active. Forms: tablet, capsule, syrup, injection, cream, other. Units: tablet,
          capsule, ml, vial, tube, piece.
        </div>

        <FormError error={error} />

        {result && result.errors.length > 0 ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm font-semibold">
              {result.errors.length} row{result.errors.length === 1 ? "" : "s"} failed
            </p>
            <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto text-sm">
              {result.errors.map((row) => (
                <li key={`${row.row}-${row.code ?? "row"}`}>
                  Row {row.row}
                  {row.code ? ` (${row.code})` : ""}: {row.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
