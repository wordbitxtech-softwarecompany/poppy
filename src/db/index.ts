import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Vercel cannot open the IPv6-only direct host `db.<ref>.supabase.co`.
 * Marketplace sets `POSTGRES_URL` to the IPv4 pooler — prefer that.
 *
 * `pg` + Drizzle uses prepared statements, so the transaction pooler (port 6543)
 * is rewritten to session mode (port 5432) on the same IPv4 pooler host.
 */
function firstEnv(keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url.replace(/^postgres:/, "postgresql:")).hostname;
  } catch {
    return null;
  }
}

function isPoolerHost(host: string | null): boolean {
  return Boolean(host && host.toLowerCase().includes("pooler.supabase.com"));
}

function isDirectSupabaseHost(url: string): boolean {
  const host = hostnameOf(url);
  return Boolean(host && /^db\.[a-z0-9]+\.supabase\.co$/i.test(host));
}

function projectRef(): string | null {
  const fromUrl = `${process.env.SUPABASE_URL ?? ""} ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`;
  const urlMatch = fromUrl.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/i);
  if (urlMatch) return urlMatch[1];

  for (const key of ["POSTGRES_HOST", "POSTGRES_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL"]) {
    const value = process.env[key] ?? "";
    const match = value.match(/db\.([a-z0-9]+)\.supabase\.co/i) ?? value.match(/postgres\.([a-z0-9]+)[:@]/i);
    if (match) return match[1];
  }
  return null;
}

function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url.replace(/^postgres:/, "postgresql:"));
    for (const key of ["pgbouncer", "connection_limit", "connect_timeout", "pool_timeout", "workaround"]) {
      parsed.searchParams.delete(key);
    }
    if (isPoolerHost(parsed.hostname) && (parsed.port === "6543" || parsed.port === "")) {
      parsed.port = "5432";
    }
    if (!parsed.searchParams.has("sslmode")) parsed.searchParams.set("sslmode", "require");
    return parsed.toString();
  } catch {
    return url;
  }
}

function assembleFromParts(): string | null {
  const host = process.env.POSTGRES_HOST?.trim();
  const password = process.env.POSTGRES_PASSWORD?.trim();
  if (!host || !password || isDirectSupabaseHost(`postgresql://x@${host}:5432/postgres`)) return null;

  const ref = projectRef();
  const configuredUser = process.env.POSTGRES_USER?.trim() || "postgres";
  const user =
    isPoolerHost(host) && ref && !configuredUser.includes(".")
      ? `postgres.${ref}`
      : configuredUser;
  const database = process.env.POSTGRES_DATABASE?.trim() || "postgres";
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${database}?sslmode=require`;
}

export function resolveDatabaseUrl(): { url: string; source: string; usingPooler: boolean } {
  const pooled = firstEnv(["POSTGRES_URL", "POSTGRES_PRISMA_URL"]);
  const any = firstEnv(["DATABASE_URL", "POSTGRES_URL_NON_POOLING"]);

  const candidates = [pooled, any].filter(Boolean) as { key: string; value: string }[];
  const preferred = candidates.find((item) => !isDirectSupabaseHost(item.value)) ?? candidates[0];
  const assembled = assembleFromParts();

  const chosen =
    preferred && !isDirectSupabaseHost(preferred.value)
      ? preferred
      : assembled
        ? { key: "POSTGRES_HOST", value: assembled }
        : preferred;

  if (!chosen) {
    throw new Error(
      "Database URL is missing. On Vercel, attach Supabase and use the Transaction pooler URI as DATABASE_URL or POSTGRES_URL (not the db.*.supabase.co direct host).",
    );
  }

  const url = normalizeUrl(chosen.value);
  return {
    url,
    source: chosen.key,
    usingPooler: isPoolerHost(hostnameOf(url)),
  };
}

const connection = resolveDatabaseUrl();

const globalForDb = globalThis as typeof globalThis & {
  __pakPropertyPool?: Pool;
};

export const pool =
  globalForDb.__pakPropertyPool ??
  new Pool({
    connectionString: connection.url,
    max: 1,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pakPropertyPool = pool;
}

export const db = drizzle(pool);
export const databaseConnectionMeta = {
  source: connection.source,
  usingPooler: connection.usingPooler,
  host: hostnameOf(connection.url),
};
