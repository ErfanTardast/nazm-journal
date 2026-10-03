import { Badge } from "@/components/ui/badge";

export function StatusPill({ value, tone = "default" }: { value: string; tone?: "default" | "success" | "warning" | "danger" }) {
  return <Badge tone={tone}>{value}</Badge>;
}
