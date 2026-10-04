"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import * as React from "react";

import { cn } from "@/lib/utils";

function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      className={cn("relative flex h-9 w-9 shrink-0 overflow-hidden rounded-full bg-muted", className)}
      {...props}
    />
  );
}

function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn("flex h-full w-full items-center justify-center text-xs font-medium", className)}
      {...props}
    />
  );
}

export { Avatar, AvatarFallback };
