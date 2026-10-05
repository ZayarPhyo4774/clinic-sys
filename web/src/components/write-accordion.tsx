"use client";

import { ChevronDown } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export type WriteAccordionSection = {
  id: string;
  title: string;
  description?: string;
  content: ReactNode;
};

export function WriteAccordion({
  sections,
  defaultSectionId,
}: {
  sections: WriteAccordionSection[];
  defaultSectionId?: string;
}) {
  const [openId, setOpenId] = useState(defaultSectionId ?? sections[0]?.id ?? "");

  if (sections.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const isOpen = openId === section.id;
        return (
          <div key={section.id} className="overflow-hidden rounded-lg border bg-card">
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left"
              aria-expanded={isOpen}
              onClick={() => setOpenId(isOpen ? "" : section.id)}
            >
              <span>
                <span className="block text-sm font-medium">{section.title}</span>
                {section.description ? (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{section.description}</span>
                ) : null}
              </span>
              <ChevronDown
                className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", isOpen && "rotate-180")}
                aria-hidden="true"
              />
            </button>
            {isOpen ? <div className="space-y-4 border-t px-4 py-4">{section.content}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
