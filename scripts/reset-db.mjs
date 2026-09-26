// Drop all tables in the dev database, re-apply migrations and seed demo data.
import { execFileSync } from "node:child_process";
import "dotenv/config";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
await client.end();
execFileSync("npx", ["prisma", "migrate", "deploy"], { stdio: "inherit" });
execFileSync("npm", ["run", "db:seed"], { stdio: "inherit" });
