import { db, databaseConnectionMeta } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json({
      ok: true,
      database: "connected",
      source: databaseConnectionMeta.source,
      usingPooler: databaseConnectionMeta.usingPooler,
      host: databaseConnectionMeta.host,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown";
    return Response.json(
      {
        ok: false,
        database: "error",
        source: databaseConnectionMeta.source,
        usingPooler: databaseConnectionMeta.usingPooler,
        host: databaseConnectionMeta.host,
        hint: databaseConnectionMeta.usingPooler
          ? message
          : "Vercel cannot reach the IPv6-only db.*.supabase.co host. Set DATABASE_URL or POSTGRES_URL to the Supabase Transaction pooler URI.",
      },
      { status: 500 },
    );
  }
}
