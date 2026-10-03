import { ok, routeHandler } from "@/lib/api/response";
import { getCurrentUser, publicUser } from "@/lib/auth/session";

export async function GET() {
  return routeHandler(async () => {
    const user = await getCurrentUser();
    return ok({ user: user ? publicUser(user) : null });
  });
}

