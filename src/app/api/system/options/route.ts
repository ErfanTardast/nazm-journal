import { ok, routeHandler } from "@/lib/api/response";
import { getSystemOptions } from "@/lib/services/system-options";

export async function GET() {
  return routeHandler(async () => ok({ options: getSystemOptions() }));
}
