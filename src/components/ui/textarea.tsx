import * as React from "react";
import { cn } from "@/lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-24 w-full rounded-md border border-border bg-background/80 px-3 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground hover:border-border/80 focus:border-primary focus:ring-2 focus:ring-primary/20",
      className
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
