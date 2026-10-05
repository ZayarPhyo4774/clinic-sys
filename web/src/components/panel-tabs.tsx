"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Tabs for narrow side panels — horizontal scroll, no flex-stretch overlap. */
export function PanelTabs(props: React.ComponentProps<typeof Tabs>) {
  return <Tabs {...props} />;
}

export function PanelTabsList({ className, ...props }: React.ComponentProps<typeof TabsList>) {
  return (
    <TabsList
      variant="line"
      className={cn(
        "h-auto w-full max-w-full flex-nowrap justify-start gap-1 overflow-x-auto rounded-none border-b bg-transparent p-0 pb-0",
        className,
      )}
      {...props}
    />
  );
}

export function PanelTabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsTrigger>) {
  return (
    <TabsTrigger
      className={cn("shrink-0 flex-none px-3 py-2 text-sm after:bottom-0", className)}
      {...props}
    />
  );
}

export const PanelTabsContent = TabsContent;
