import "dotenv/config";
import pg from "pg";

const { Client } = pg;

function printHelp(message) {
  console.error("");
  console.error("Nazm database preflight failed");
  console.error("------------------------------");
  console.error(message);
  console.error("");
  console.error("What to check in Windows PowerShell:");
  console.error("1. Confirm .env exists in the project folder (copy .env.example).");
  console.error("2. Confirm DATABASE_URL points to your PostgreSQL database.");
  console.error("3. Start PostgreSQL, or start the Docker DB service:");
  console.error("   docker compose up -d db");
  console.error("4. If using local PostgreSQL, create the database if needed:");
  console.error("   createdb trademaster_ai");
  console.error("5. Then run:");
  console.error("   npm run db:migrate");
  console.error("   npm run db:seed");
  console.error("");
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  printHelp("DATABASE_URL is missing. Copy .env.example to .env and set DATABASE_URL.");
  process.exit(1);
}

const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });

try {
  await client.connect();
  await client.query("select 1");
  console.log("Database preflight passed: PostgreSQL is reachable.");
} catch (error) {
  const code = typeof error === "object" && error && "code" in error ? ` (${error.code})` : "";
  printHelp(`PostgreSQL is not running or not reachable${code}. Check .env, DATABASE_URL, and the database service.`);
  process.exit(1);
} finally {
  await client.end().catch(() => undefined);
}
