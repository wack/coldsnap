import type { Tenant, TenantProgress, TenantStatus } from "./model";

/**
 * What the dashboard's client components receive. Deliberately omits the
 * session secret, internal ids, and object-store locations; the password is
 * included because Frank reveals and copies it from the card.
 */
export interface TenantView {
  readonly id: string;
  readonly name: string;
  readonly subdomain: string;
  readonly email: string;
  readonly password: string;
  readonly model: string;
  readonly status: TenantStatus;
  readonly progress: TenantProgress | null;
  readonly lastError: string | null;
  readonly url: string | null;
  readonly host: string;
  readonly previewImageUrl: string | null;
  readonly canModify: boolean;
  readonly createdAt: string;
}

export function toTenantView(tenant: Tenant, previewHost: string): TenantView {
  return {
    id: tenant.id,
    name: tenant.name,
    subdomain: tenant.subdomain,
    email: tenant.email,
    password: tenant.password,
    model: tenant.model,
    status: tenant.status,
    progress: tenant.progress,
    lastError: tenant.lastError,
    url: tenant.url,
    host: tenant.url ? new URL(tenant.url).host : previewHost,
    previewImageUrl: tenant.previewImageUrl,
    canModify: tenant.status === "live" && tenant.sourceUrl !== null,
    createdAt: tenant.createdAt,
  };
}
