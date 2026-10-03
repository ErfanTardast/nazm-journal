import { NotFoundView } from "@/components/ui/not-found-view";

// notFound() from a page under /[locale] (a switched-off page such as billing) lands here, inside the app shell.
export default function LocaleNotFound() {
  return <NotFoundView />;
}
