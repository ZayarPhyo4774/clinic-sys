"use client";

import { useMemo } from "react";

import { useResourceList } from "@/hooks/use-resource-list";
import { withQuery } from "@/lib/api/client";
import type { Patient, PaymentMethod } from "@/lib/api/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function useBillingLookups() {
  const patientsQuery = useResourceList<Patient>("patients", withQuery("/patients/", { page_size: "500" }));
  const paymentMethodsQuery = useResourceList<PaymentMethod>(
    "payment-methods",
    withQuery("/payment-methods/", { page_size: "100" }),
  );

  const patientNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const patient of patientsQuery.data ?? []) {
      map.set(patient.id, patient.full_name);
    }
    return map;
  }, [patientsQuery.data]);

  const paymentMethodLookup = useMemo(() => {
    const byId = new Map<string, string>();
    const byCode = new Map<string, string>();
    for (const method of paymentMethodsQuery.data ?? []) {
      byId.set(method.id, method.name);
      byCode.set(method.code, method.name);
    }
    return { byId, byCode };
  }, [paymentMethodsQuery.data]);

  function resolvePatientName(patientId: string, apiName?: string | null) {
    const fromCatalog = patientNameById.get(patientId);
    if (fromCatalog) {
      return fromCatalog;
    }
    if (apiName && !isUuid(apiName)) {
      return apiName;
    }
    return "Unknown patient";
  }

  function resolvePaymentMethodName(methodId: string, apiName?: string | null) {
    const fromCatalog = paymentMethodLookup.byId.get(methodId) ?? paymentMethodLookup.byCode.get(methodId);
    if (fromCatalog) {
      return fromCatalog;
    }
    if (apiName) {
      const fromApiCode = paymentMethodLookup.byCode.get(apiName);
      if (fromApiCode) {
        return fromApiCode;
      }
      if (!isUuid(apiName)) {
        return apiName;
      }
    }
    return "Unknown method";
  }

  return {
    resolvePatientName,
    resolvePaymentMethodName,
    isLoading: patientsQuery.isLoading || paymentMethodsQuery.isLoading,
  };
}
