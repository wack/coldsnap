import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import type { TenantProgress, TenantStatus } from "../tenants/model";

export const tenants = pgTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  description: text("description").notNull(),
  email: text("email").notNull(),
  password: text("password").notNull(),
  sessionSecret: text("session_secret").notNull(),
  model: text("model").notNull(),
  status: text("status").$type<TenantStatus>().notNull(),
  progress: jsonb("progress").$type<TenantProgress | null>(),
  activity: text("activity"),
  lastError: text("last_error"),
  vercelProjectName: text("vercel_project_name").notNull(),
  vercelProjectId: text("vercel_project_id"),
  domain: text("domain"),
  url: text("url"),
  deploymentId: text("deployment_id"),
  sourceUrl: text("source_url"),
  previewImageUrl: text("preview_image_url"),
  workflowRunId: text("workflow_run_id"),
  agentSessionId: text("agent_session_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schema = { tenants };

/**
 * Idempotent DDL, applied once per process before the first query. The table
 * is small and append-mostly, so an in-code migration avoids a separate
 * migration step in the deploy pipeline. Add columns with `ADD COLUMN IF NOT
 * EXISTS` statements below the CREATE when the schema grows.
 */
export const SCHEMA_DDL = [
  sql`CREATE TABLE IF NOT EXISTS tenants (
    id text PRIMARY KEY,
    name text NOT NULL,
    subdomain text NOT NULL UNIQUE,
    description text NOT NULL,
    email text NOT NULL,
    password text NOT NULL,
    session_secret text NOT NULL,
    model text NOT NULL,
    status text NOT NULL,
    progress jsonb,
    activity text,
    last_error text,
    vercel_project_name text NOT NULL,
    vercel_project_id text,
    domain text,
    url text,
    deployment_id text,
    source_url text,
    preview_image_url text,
    workflow_run_id text,
    agent_session_id text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  )`,
];
