"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export type Choice<T extends string> = { value: T; title: string; description: string };

/**
 * Large single-choice cards, built as a radio group (role radiogroup / radio, one tab stop, arrow keys, Home and End).
 * Choosing is the action: a click, Enter or Space picks the card and the flow moves on, so the arrow keys only move
 * focus (they do not pick) and a keyboard user can look through the cards before choosing one.
 */
export function ChoiceGroup<T extends string>({
  labelledBy,
  describedBy,
  choices,
  value,
  busy,
  onChoose
}: {
  labelledBy: string;
  describedBy?: string;
  choices: Choice<T>[];
  value: T | null;
  /** An answer is being saved: further choices are ignored until it is done. */
  busy: boolean;
  onChoose: (value: T) => void;
}) {
  const base = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const selected = choices.findIndex((choice) => choice.value === value);
  const [active, setActive] = useState(selected >= 0 ? selected : 0);

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = choices.length - 1;
    let target: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") target = index === last ? 0 : index + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") target = index === 0 ? last : index - 1;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = last;
    if (target === null) return;
    event.preventDefault();
    buttons.current[target]?.focus();
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} aria-busy={busy || undefined} className="grid gap-3">
      {choices.map((choice, index) => {
        const checked = choice.value === value;
        return (
          <button
            key={choice.value}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-labelledby={`${base}-${index}-title`}
            aria-describedby={`${base}-${index}-description`}
            aria-disabled={busy || undefined}
            tabIndex={index === active ? 0 : -1}
            onFocus={() => setActive(index)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onClick={() => {
              if (!busy) onChoose(choice.value);
            }}
            className={cn(
              "flex min-h-16 w-full min-w-0 items-start gap-3 rounded-lg border p-4 text-start transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              checked ? "border-primary bg-primary/10" : "border-border bg-background/60 hover:border-primary/40 hover:bg-muted/60",
              busy && "cursor-wait opacity-70"
            )}
          >
            {checked ? (
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
            <span className="min-w-0 break-words">
              <span id={`${base}-${index}-title`} className="block text-sm font-semibold text-foreground">
                {choice.title}
              </span>
              <span id={`${base}-${index}-description`} className="mt-1 block text-sm leading-6 text-muted-foreground">
                {choice.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
