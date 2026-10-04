import * as React from "react";

import { cn } from "@/lib/utils";

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead className={cn("sticky top-0 z-10 bg-card/95 backdrop-blur-sm [&_tr]:border-b", className)} {...props} />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody className={cn("[&_tr:last-child]:border-0 [&_tr:nth-child(even)]:bg-muted/30", className)} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return <tr className={cn("border-b transition-colors hover:bg-accent/50", className)} {...props} />;
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      className={cn(
        "h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-wider text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return <td className={cn("px-4 py-3 align-middle", className)} {...props} />;
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption className={cn("sr-only", className)} {...props} />;
}

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow };
