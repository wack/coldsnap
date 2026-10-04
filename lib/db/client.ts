import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

import { getAppConfig } from "../config";
import { schema, SCHEMA_DDL } from "./schema";

export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Process-wide database handle.
 *
 * Production uses Neon Postgres over HTTP (`DATABASE_URL`, provisioned through
 * the Vercel Marketplace). Without it, Coldsnap runs on PGlite, Postgres
 * compiled to WASM, so local development and tests execute the same SQL with
 * no server. The handle lives on `globalThis` because Next.js route modules
 * and Workflow step bundles each load their own copy of this file, and an
 * in-memory database must be shared by all of them.
 */
interface DatabaseSlot {
  promise?: Promise<Database>;
}

const SLOT_KEY = Symbol.for("coldsnap.database");

function slot(): DatabaseSlot {
  const holder = globalThis as unknown as Record<symbol, DatabaseSlot | undefined>;
  holder[SLOT_KEY] ??= {};
  return holder[SLOT_KEY];
}

export function getDatabase(): Promise<Database> {
  const s = slot();
  s.promise ??= openDatabase().catch((error: unknown) => {
    s.promise = undefined;
    throw error;
  });
  return s.promise;
}

/** Drops the shared handle. Tests call this to start from an empty database. */
export async function resetDatabaseForTests(): Promise<void> {
  const s = slot();
  const current = s.promise;
  s.promise = undefined;
  if (current) {
    const db = (await current) as Database & { $client?: { close?: () => Promise<void> } };
    await db.$client?.close?.();
  }
}

async function openDatabase(): Promise<Database> {
  const db = process.env.DATABASE_URL
    ? await openNeon(process.env.DATABASE_URL)
    : await openPglite(pgliteDataDir());
  for (const statement of SCHEMA_DDL) {
    await db.execute(statement);
  }
  return db;
}

function pgliteDataDir(): string {
  if (process.env.COLDSNAP_PGLITE_DIR) return process.env.COLDSNAP_PGLITE_DIR;
  return getAppConfig().drivers === "memory" ? "memory://" : ".data/pglite";
}

async function openNeon(url: string): Promise<Database> {
  const [{ neon }, { drizzle }] = await Promise.all([
    import("@neondatabase/serverless"),
    import("drizzle-orm/neon-http"),
  ]);
  return drizzle(neon(url), { schema }) as unknown as Database;
}

async function openPglite(dataDir: string): Promise<Database> {
  const [{ PGlite }, { drizzle }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
  ]);
  return drizzle(new PGlite(dataDir), { schema }) as unknown as Database;
}
