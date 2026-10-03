/* global fetch, AbortSignal */
// Container health check: exit 0 when the app answers /api/health with ok, else 1. A file instead of an inline
// `node -e "..."`, because some hosts split the health-check command on spaces.
const port = process.env.PORT || "3000";

fetch(`http://localhost:${port}/api/health`, { signal: AbortSignal.timeout(8000) })
  .then((response) => process.exit(response.ok ? 0 : 1))
  .catch(() => process.exit(1));
