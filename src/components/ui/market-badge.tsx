import { Badge } from "@/components/ui/badge";

export function MarketBadge({ market }: { market: "crypto" | "forex" | "stocks" | string }) {
  const label = market === "stocks" ? "Global Stocks" : market.charAt(0).toUpperCase() + market.slice(1);
  const tone = market === "crypto" ? "warning" : market === "forex" ? "success" : "default";
  return <Badge tone={tone}>{label}</Badge>;
}
