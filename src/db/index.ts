import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Vercel cannot open the IPv6-only direct host `db.<ref>.supabase.co`.
 * If POSTGRES_URL is missing, rewrite DATABASE_URL to the shared IPv4 pooler.
 */
const FALLBACK_POOLER_REGION = "ap-northeast-2";

function firstEnv(keys: string[]): { key: string; value: string } | null {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return { key, value };
  }
  return null;
}

function asUrl(value: string): URL | null {
  try {
    return new URL(value.replace(/^postgres:/, "postgresql:"));
  } catch {
    return null;
  }
}

function hostnameOf(url: string): string | null {
  return asUrl(url)?.hostname ?? null;
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

function poolerRegion(): string {
  return process.env.SUPABASE_REGION?.trim() || FALLBACK_POOLER_REGION;
}

function poolerHosts(): string[] {
  if (process.env.SUPABASE_POOLER_HOST?.trim()) return [process.env.SUPABASE_POOLER_HOST.trim()];
  const region = poolerRegion();
  return [`aws-0-${region}.pooler.supabase.com`, `aws-1-${region}.pooler.supabase.com`];
}

function buildPoolerUrl(user: string, password: string, host: string, database: string): string {
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${database}?sslmode=require`;
}

function rewriteDirectToPooler(url: string): string | null {
  const parsed = asUrl(url);
  if (!parsed?.password) return null;
  const match = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i);
  const ref = match?.[1] ?? projectRef();
  if (!ref) return null;
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "postgres";
  return buildPoolerUrl(`postgres.${ref}`, parsed.password, poolerHosts()[0], database);
}

function normalizeUrl(url: string): string {
  const parsed = asUrl(url);
  if (!parsed) return url;
  for (const key of ["pgbouncer", "connection_limit", "connect_timeout", "pool_timeout", "workaround"]) {
    parsed.searchParams.delete(key);
  }
  if (isPoolerHost(parsed.hostname) && (parsed.port === "6543" || parsed.port === "")) {
    parsed.port = "5432";
  }
  if (!parsed.searchParams.has("sslmode")) parsed.searchParams.set("sslmode", "require");
  return parsed.toString();
}

function assembleFromParts(): string | null {
  const password = process.env.POSTGRES_PASSWORD?.trim();
  const ref = projectRef();
  if (!password || !ref) return null;
  const database = process.env.POSTGRES_DATABASE?.trim() || "postgres";
  const host = process.env.POSTGRES_HOST?.trim();
  if (host && isPoolerHost(host)) {
    const configuredUser = process.env.POSTGRES_USER?.trim() || "postgres";
    const user = configuredUser.includes(".") ? configuredUser : `postgres.${ref}`;
    return buildPoolerUrl(user, password, host, database);
  }
  return buildPoolerUrl(`postgres.${ref}`, password, poolerHosts()[0], database);
}

export function resolveDatabaseUrl(): { url: string; source: string; usingPooler: boolean } {
  const pooled = firstEnv(["POSTGRES_URL", "POSTGRES_PRISMA_URL"]);
  const any = firstEnv(["DATABASE_URL", "POSTGRES_URL_NON_POOLING"]);
  const candidates = [pooled, any].filter(Boolean) as { key: string; value: string }[];
  const preferred = candidates.find((item) => !isDirectSupabaseHost(item.value)) ?? candidates[0];
  const assembled = assembleFromParts();
  const rewritten = preferred && isDirectSupabaseHost(preferred.value) ? rewriteDirectToPooler(preferred.value) : null;

  const chosen =
    preferred && !isDirectSupabaseHost(preferred.value)
      ? preferred
      : rewritten
        ? { key: `${preferred?.key ?? "DATABASE_URL"}->pooler`, value: rewritten }
        : assembled
          ? { key: "POSTGRES_PASSWORD->pooler", value: assembled }
          : preferred;

  if (!chosen) {
    throw new Error(
      "Database URL is missing. On Vercel, set POSTGRES_URL to the Supabase Session/Transaction pooler URI (host *.pooler.supabase.com), not db.*.supabase.co.",
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
