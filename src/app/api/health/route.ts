import { databaseConnectionMeta, pool } from "@/db";

export const dynamic = "force-dynamic";

function serializeError(error: unknown) {
  if (!(error instanceof Error)) return { message: String(error) };
  const err = error as Error & { code?: string; cause?: unknown };
  const cause = err.cause instanceof Error ? { message: err.cause.message, code: (err.cause as { code?: string }).code } : undefined;
  return { message: err.message, code: err.code, cause };
}

export async function GET() {
  try {
    await pool.query("select 1");
    return Response.json({
      ok: true,
      database: "connected",
      source: databaseConnectionMeta.source,
      usingPooler: databaseConnectionMeta.usingPooler,
      host: databaseConnectionMeta.host,
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        database: "error",
        source: databaseConnectionMeta.source,
        usingPooler: databaseConnectionMeta.usingPooler,
        host: databaseConnectionMeta.host,
        error: serializeError(error),
      },
      { status: 500 },
    );
  }
}

