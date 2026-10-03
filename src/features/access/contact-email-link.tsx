/**
 * The contact address as selectable text that is also a mailto link. It is isolated and left-to-right, so it reads
 * correctly inside a Persian sentence; `select-all` lets a tap select the whole address for copying when no mail app opens.
 */
export function ContactEmail({ email }: { email: string }) {
  return (
    <bdi>
      <a href={`mailto:${email}`} dir="ltr" className="select-all break-all font-semibold text-primary hover:underline">
        {email}
      </a>
    </bdi>
  );
}
