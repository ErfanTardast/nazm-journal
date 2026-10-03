import { idBodySchema } from "@/lib/validation/trading";

export async function readId(request: Request) {
  const urlId = new URL(request.url).searchParams.get("id");
  if (urlId) {
    return idBodySchema.parse({ id: urlId }).id;
  }

  const body = await request.json().catch(() => ({}));
  return idBodySchema.parse(body).id;
}

