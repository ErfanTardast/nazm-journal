import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    // `prisma generate` during a Docker build has no database; it only needs a well-formed URL. At run time
    // DATABASE_URL is required by the app (src/lib/env.ts), and migrate deploy fails loudly without it.
    url: process.env.DATABASE_URL || "postgresql://build:build@localhost:5432/build"
  }
});
