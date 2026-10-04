"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { operatorSectionMeta, type OperatorSectionId } from "@/features/operator/constants";

function readSection(): OperatorSectionId {
  if (typeof window === "undefined") {
    return "overview";
  }
  const hash = window.location.hash.replace("#", "") as OperatorSectionId;
  return operatorSectionMeta(hash).id;
}

type OperatorSectionContextValue = {
  section: OperatorSectionId;
  navigate: (section: OperatorSectionId) => void;
};

const OperatorSectionContext = createContext<OperatorSectionContextValue | null>(null);

export function OperatorSectionProvider({ children }: { children: React.ReactNode }) {
  const [section, setSection] = useState<OperatorSectionId>("overview");

  useEffect(() => {
    setSection(readSection());
    const sync = () => setSection(readSection());
    window.addEventListener("hashchange", sync);
    window.addEventListener("popstate", sync);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener("popstate", sync);
    };
  }, []);

  const navigate = useCallback((next: OperatorSectionId) => {
    setSection(next);
    const hash = `#${next}`;
    if (window.location.pathname.endsWith("/operator")) {
      const url = `${window.location.pathname}${hash}`;
      window.history.pushState(null, "", url);
      return;
    }
    window.location.assign(`/operator${hash}`);
  }, []);

  return (
    <OperatorSectionContext.Provider value={{ section, navigate }}>
      {children}
    </OperatorSectionContext.Provider>
  );
}

export function useOperatorSection() {
  const value = useContext(OperatorSectionContext);
  if (!value) {
    throw new Error("useOperatorSection must be used within OperatorSectionProvider");
  }
  return value;
}
