import { OperatorShell } from "@/components/operator-shell";
import { OperatorSectionProvider } from "@/features/operator/operator-section-context";

export default function OperatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <OperatorSectionProvider>
      <OperatorShell>{children}</OperatorShell>
    </OperatorSectionProvider>
  );
}
