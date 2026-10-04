import { desc, eq } from "drizzle-orm";

import { getDatabase, type Database } from "../db/client";
import { tenants } from "../db/schema";
import type { NewTenant, Tenant, TenantPatch } from "./model";

export class SubdomainTakenError extends Error {
  constructor(readonly subdomain: string) {
    super(`The subdomain "${subdomain}" is already in use.`);
    this.name = "SubdomainTakenError";
  }
}

export class TenantNotFoundError extends Error {
  constructor(readonly id: string) {
    super(`Tenant ${id} does not exist.`);
    this.name = "TenantNotFoundError";
  }
}

export interface TenantRepository {
  list(): Promise<Tenant[]>;
  get(id: string): Promise<Tenant | null>;
  require(id: string): Promise<Tenant>;
  /** Throws {@link SubdomainTakenError} when the subdomain is already claimed. */
  insert(tenant: NewTenant): Promise<Tenant>;
  update(id: string, patch: TenantPatch): Promise<Tenant>;
  /**
   * Writes only the `activity` column. The eve agent calls this while the
   * workflow concurrently rewrites `progress`; touching a single column keeps
   * the two writers from overwriting each other.
   */
  setActivity(id: string, activity: string | null): Promise<void>;
  delete(id: string): Promise<void>;
}

type Row = typeof tenants.$inferSelect;

function toTenant(row: Row): Tenant {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isUniqueViolation(error: unknown): boolean {
  for (let current: unknown = error; current; current = (current as { cause?: unknown }).cause) {
    if ((current as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

export class SqlTenantRepository implements TenantRepository {
  constructor(private readonly db: () => Promise<Database> = getDatabase) {}

  async list(): Promise<Tenant[]> {
    const db = await this.db();
    const rows = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
    return rows.map(toTenant);
  }

  async get(id: string): Promise<Tenant | null> {
    const db = await this.db();
    const [row] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
    return row ? toTenant(row) : null;
  }

  async require(id: string): Promise<Tenant> {
    const tenant = await this.get(id);
    if (!tenant) throw new TenantNotFoundError(id);
    return tenant;
  }

  async insert(tenant: NewTenant): Promise<Tenant> {
    const db = await this.db();
    try {
      const [row] = await db.insert(tenants).values(tenant).returning();
      return toTenant(row!);
    } catch (error) {
      if (isUniqueViolation(error)) throw new SubdomainTakenError(tenant.subdomain);
      throw error;
    }
  }

  async update(id: string, patch: TenantPatch): Promise<Tenant> {
    const db = await this.db();
    const [row] = await db
      .update(tenants)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(tenants.id, id))
      .returning();
    if (!row) throw new TenantNotFoundError(id);
    return toTenant(row);
  }

  async setActivity(id: string, activity: string | null): Promise<void> {
    const db = await this.db();
    await db.update(tenants).set({ activity }).where(eq(tenants.id, id));
  }

  async delete(id: string): Promise<void> {
    const db = await this.db();
    await db.delete(tenants).where(eq(tenants.id, id));
  }
}
