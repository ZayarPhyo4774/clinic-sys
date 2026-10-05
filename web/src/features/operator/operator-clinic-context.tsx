"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "operator:selectedClinicId";

export type OperatorClinicRow = {
  id: string;
  name: string;
  code: string;
};

type OperatorClinicContextValue = {
  clinicId: string;
  setClinicId: (id: string) => void;
  clinics: OperatorClinicRow[];
  selectedClinic: OperatorClinicRow | null;
};

const OperatorClinicContext = createContext<OperatorClinicContextValue | null>(null);

export function OperatorClinicProvider({
  clinics,
  children,
}: {
  clinics: OperatorClinicRow[];
  children: React.ReactNode;
}) {
  const [clinicId, setClinicIdState] = useState("");

  useEffect(() => {
    if (clinics.length === 0) {
      setClinicIdState("");
      return;
    }
    const stored = typeof window !== "undefined" ? sessionStorage.getItem(STORAGE_KEY) : null;
    if (stored && clinics.some((row) => row.id === stored)) {
      setClinicIdState(stored);
      return;
    }
    setClinicIdState(clinics[0].id);
  }, [clinics]);

  const setClinicId = useCallback((id: string) => {
    setClinicIdState(id);
    if (typeof window !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, id);
    }
  }, []);

  const selectedClinic = useMemo(
    () => clinics.find((row) => row.id === clinicId) ?? null,
    [clinicId, clinics],
  );

  return (
    <OperatorClinicContext.Provider value={{ clinicId, setClinicId, clinics, selectedClinic }}>
      {children}
    </OperatorClinicContext.Provider>
  );
}

export function useOperatorClinic() {
  const value = useContext(OperatorClinicContext);
  if (!value) {
    throw new Error("useOperatorClinic must be used within OperatorClinicProvider");
  }
  return value;
}
