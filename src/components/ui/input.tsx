import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "min-h-11 w-full rounded-md border border-border bg-background/80 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground hover:border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20",
      className
    )}
    {...props}
  />
));

Input.displayName = "Input";
