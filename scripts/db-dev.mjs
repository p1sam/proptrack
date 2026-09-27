// Local development Postgres (real PostgreSQL 17 binaries from the embedded-postgres package —
// no Docker or system install). Data lives in ./.postgres; stop with Ctrl+C.
//   npm run db:start
import { existsSync } from "node:fs";
import EmbeddedPostgres from "embedded-postgres";

const port = Number(process.env.DEV_DB_PORT ?? 51216);
const dataDir = "./.postgres";
const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: "postgres", password: "postgres", port, persistent: true });

if (!existsSync(`${dataDir}/PG_VERSION`)) {
  console.log("Initialising database cluster in ./.postgres …");
  await pg.initialise();
}
await pg.start();
try {
  await pg.createDatabase("proptrack");
} catch {
  // already exists
}
console.log(`Postgres ready: postgres://postgres:postgres@127.0.0.1:${port}/proptrack`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
setInterval(() => {}, 1 << 30);
