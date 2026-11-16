import { env } from "cloudflare:workers";

/** Liveness probe used by the deploy smoke check: verifies the Worker runs and D1 answers. */
export async function loader() {
  const row = await env.DB.prepare("SELECT 1 AS ok").first<{ ok: number }>();
  return Response.json(
    { ok: row?.ok === 1, version: env.CF_VERSION_METADATA.id, environment: env.APP_ENV },
    { headers: { "Cache-Control": "no-store" } },
  );
}
