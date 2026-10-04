import { cn } from "@/lib/utils";

export function BrandLogo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "size-8 text-xs",
    md: "size-10 text-sm",
    lg: "size-12 text-base",
  };

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xl bg-primary font-bold text-primary-foreground shadow-premium-sm",
        sizes[size],
        className,
      )}
      aria-hidden="true"
    >
      CS
    </div>
  );
}
