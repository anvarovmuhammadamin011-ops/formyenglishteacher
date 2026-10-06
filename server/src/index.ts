import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { env } from "./config/env";
import { prisma, disconnectPrisma } from "./lib/prisma";

const EMBEDDED_URL = "postgresql://postgres:postgres@127.0.0.1:5432/elms?schema=public";

function canConnect(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host });
    const finish = (ok: boolean) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(1200, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function ensureDatabase(): Promise<void> {
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === "") {
    if (env.NODE_ENV === "production") {
      console.error("❌ DATABASE_URL is not configured.");
      process.exit(1);
    }
    process.env.DATABASE_URL = EMBEDDED_URL;
    console.log("[db] DATABASE_URL not set — using embedded PostgreSQL defaults.");
  }

  const portMatch = /:\/\/[^:]+:[^@]+@[^:]+:(\d+)/.exec(process.env.DATABASE_URL);
  const port = portMatch ? Number(portMatch[1]) : 5432;

  // Fast path: database already reachable.
  for (let i = 0; i < 4; i++) {
    if (await canConnect(port)) break;
    await sleep(700);
  }

  // Slow path (local dev): boot the embedded PostgreSQL server.
  if ((await canConnect(port)) === false && port === 5432 && env.NODE_ENV !== "production") {
    console.log("[db] PostgreSQL not reachable — starting embedded PostgreSQL ...");
    const serverRoot = path.resolve(__dirname, "..");
    spawn("npm", ["run", "dev:db"], {
      cwd: serverRoot,
      detached: true,
      stdio: "ignore",
      shell: true,
    }).unref();

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      if (await canConnect(port)) break;
      await sleep(1000);
    }
  }

  const started = Date.now();
  // The Prisma client is created lazily, after DATABASE_URL is guaranteed.
  for (;;) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      const ms = Date.now() - started;
      if (ms > 500) console.log(`[db] Connected (${ms}ms).`);
      return;
    } catch (err) {
      if (Date.now() - started > 90_000) {
        console.error("❌ Could not connect to PostgreSQL.");
        console.error("   Start it with:  npm run dev:db   (or set DATABASE_URL to your own server)");
        console.error((err as Error).message);
        process.exit(1);
      }
      await sleep(1200);
    }
  }
}

async function main() {
  await ensureDatabase();

  const { createApp } = await import("./app");
  const app = createApp();

  const server = app.listen(env.PORT, () => {
    console.log(`\n  ELMS API ready`);
    console.log(`  → http://localhost:${env.PORT}/api/health`);
    console.log(`  → env: ${env.NODE_ENV}\n`);
  });

  const shutdown = async (signal: string) => {
    console.log(`\n[server] ${signal} received, shutting down ...`);
    server.close(async () => {
      await disconnectPrisma();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[server] Failed to start:", err);
  process.exit(1);
});
