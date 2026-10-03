import { forbidden } from "@/lib/api/errors";
import { hasPermission, hasRole, type PermissionUser } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db/prisma";
import { getSystemOptions } from "@/lib/services/system-options";
import { getProviderMetrics } from "@/lib/observability/metrics";

export async function getAdminOverview(user: PermissionUser) {
  if (!hasRole(user, "admin") && !hasPermission(user, "admin:read")) {
    throw forbidden("Admin access is required");
  }

  const [users, trades, portfolios, alerts, auditLogs, featureFlags, providerActivity] = await Promise.all([
    prisma.user.count(),
    // People's own trades: the rows of a sample workspace are not activity.
    prisma.trade.count({ where: { isSample: false } }),
    prisma.portfolio.count(),
    prisma.alert.count(),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.featureFlag.findMany({ orderBy: { key: "asc" } }),
    getProviderMetrics()
  ]);
  const options = getSystemOptions();

  return {
    counts: {
      users,
      trades,
      portfolios,
      alerts
    },
    featureFlags,
    auditLogs,
    providerActivity,
    system: {
      database: "configured",
      redis: options.infrastructure.redis,
      aiProvider: options.ai.provider,
      emailProvider: options.infrastructure.emailProvider,
      marketDataProvider: options.infrastructure.marketDataProvider,
      appUrl: options.infrastructure.appUrl
    },
    options: {
      supportedMarkets: options.product.supportedMarkets,
      coreWorkflows: options.product.coreWorkflows,
      safetyGuardrails: options.product.safetyGuardrails,
      aiWorkflows: options.ai.workflows
    }
  };
}
