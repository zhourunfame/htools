import { getDatabase, json, requireAdmin, type Env } from "../../_shared";

const SOURCE_PUBLIC_KEY = "source_public_enabled";
const SOURCE_PATH = "/api/htools.json";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    return json({
      settings: await readSourceSettings(env, request)
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load source settings.";
    return json({ error: message }, { status: 400 });
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = (await request.json()) as { enabled?: unknown };
    const enabled = payload.enabled === true;

    const db = await getDatabase(env);

    await db.prepare(
      `INSERT INTO app_settings (key, value, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    )
      .bind(SOURCE_PUBLIC_KEY, JSON.stringify({ enabled }))
      .run();

    return json({
      settings: await readSourceSettings(env, request)
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to save source settings.";
    return json({ error: message }, { status: 400 });
  }
};

async function readSourceSettings(env: Env, request: Request) {
  const db = await getDatabase(env);
  const row = await db.prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind(SOURCE_PUBLIC_KEY)
    .first<{ value: string }>();

  return {
    enabled: readEnabled(row?.value),
    sourceUrl: new URL(SOURCE_PATH, request.url).toString(),
    sourcePath: SOURCE_PATH
  };
}

function readEnabled(value?: string) {
  if (!value) {
    return false;
  }

  try {
    const parsed = JSON.parse(value) as { enabled?: unknown };
    return parsed.enabled === true;
  } catch {
    return false;
  }
}
