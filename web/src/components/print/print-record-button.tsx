"use client";

import { Printer } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function PrintRecordButton({
  href,
  label = "Print",
}: {
  href: string;
  label?: string;
}) {
  return (
    <Button asChild variant="outline" size="sm" className="no-print">
      <Link href={href}>
        <Printer className="size-4" aria-hidden="true" />
        {label}
      </Link>
    </Button>
  );
}
