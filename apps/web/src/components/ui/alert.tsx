import * as React from "react";

import { cn } from "@/lib/utils";

export function Alert({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900",
        className,
      )}
      role="alert"
      {...props}
    />
  );
}

export function AlertTitle({
  className,
  ...props
}: React.ComponentProps<"h5">) {
  return (
    <h5 className={cn("mb-1 font-medium leading-none", className)} {...props} />
  );
}

export function AlertDescription({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={cn("text-sm", className)} {...props} />;
}
