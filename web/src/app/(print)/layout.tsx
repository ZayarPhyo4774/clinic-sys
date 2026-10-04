export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="print-root min-h-screen overflow-x-hidden bg-muted/30 px-4 py-6 md:px-8">{children}</div>
  );
}
