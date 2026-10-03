import { NotFoundView } from "@/components/ui/not-found-view";

// Unknown URLs outside any page (e.g. a typo under /fa); notFound() calls inside /[locale] use [locale]/not-found.tsx.
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 text-foreground">
      <NotFoundView />
    </main>
  );
}
