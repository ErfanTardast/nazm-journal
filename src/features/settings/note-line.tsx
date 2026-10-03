export type Note = { kind: "status" | "error"; text: string };

/** A result line (saved / failed) shown right above the button that caused it. */
export function NoteLine({ note, className = "" }: { note: Note | null; className?: string }) {
  if (!note) return null;
  const tone = note.kind === "status" ? "border-success/30 bg-success/10 text-success" : "border-destructive/30 bg-destructive/10 text-destructive";
  return (
    <p role={note.kind === "status" ? "status" : "alert"} className={`rounded-md border p-3 text-sm ${tone} ${className}`}>
      {note.text}
    </p>
  );
}
