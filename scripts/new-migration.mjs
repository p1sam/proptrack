// Create a migration from the difference between the database and prisma/schema.prisma.
// Usage: npm run db:migration:new -- <name>
// (Diffs against the live database, so no shadow database is needed.)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const name = (process.argv[2] ?? "").replace(/[^a-z0-9_]/gi, "_").toLowerCase();
if (!name) {
  console.error("Usage: npm run db:migration:new -- <name>");
  process.exit(1);
}
const sql = execFileSync("npx", ["prisma", "migrate", "diff", "--from-config-datasource", "--to-schema", "prisma/schema.prisma", "--script"], { encoding: "utf8" });
if (!sql.trim() || /empty migration/i.test(sql)) {
  console.log("No schema changes.");
  process.exit(0);
}
const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const dir = `prisma/migrations/${stamp}_${name}`;
mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/migration.sql`, sql);
console.log(`Wrote ${dir}/migration.sql — apply with: npm run db:migrate`);
