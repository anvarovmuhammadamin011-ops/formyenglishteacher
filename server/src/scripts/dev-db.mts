/**
 * Boots a local PostgreSQL server using embedded-postgres binaries.
 *
 * - Exits immediately when DATABASE_URL is already configured (production).
 * - Exits immediately when a server is already listening on the port.
 * - Otherwise initialises a cluster in server/data/db and starts it.
 *
 * Run: npm run dev:db
 */
import net from "node:net";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..", "..");

const PORT = Number(process.env.DATABASE_PORT || 5432);
const USER = process.env.DATABASE_USER || "postgres";
const PASSWORD = process.env.DATABASE_PASSWORD || "postgres";
const DB_NAME = process.env.DATABASE_NAME || "elms";
const DATABASE_DIR = path.join(ROOT, "data", "db");

function canConnect(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const done = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1500, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

async function main() {
  if (process.env.DATABASE_URL) {
    console.log("[db] DATABASE_URL configured — skipping embedded PostgreSQL.");
    return;
  }

  if (await canConnect(PORT)) {
    console.log(`[db] PostgreSQL already listening on port ${PORT} — nothing to do.`);
    return;
  }

  const pg = new EmbeddedPostgres({
    databaseDir: DATABASE_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    // UTF8 is required for Cyrillic (Russian) translations in vocabulary.
    initdbFlags: ["--encoding=UTF8"],
    postgresFlags: ["-c", "listen_addresses=localhost"],
  });

  const initialised = fs.existsSync(path.join(DATABASE_DIR, "PG_VERSION"));
  if (!initialised) {
    console.log(`[db] Initialising cluster at ${DATABASE_DIR} ...`);
    await pg.initialise();
  }

  console.log(`[db] Starting PostgreSQL on port ${PORT} ...`);
  await pg.start();

  try {
    await pg.createDatabase(DB_NAME);
    console.log(`[db] Database "${DB_NAME}" ready.`);
  } catch {
    console.log(`[db] Database "${DB_NAME}" already exists.`);
  }

  console.log(
    `[db] Connection string: postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}`,
  );

  const shutdown = async () => {
    try {
      await pg.stop();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive so the postgres child process stays managed.
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => {
  console.error("[db] Failed to start embedded PostgreSQL:", err);
  process.exit(1);
});
