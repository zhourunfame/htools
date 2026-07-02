import { getDatabase, json, toolFromRow, type Env, type ToolRow } from "../_shared";

const SOURCE_PUBLIC_KEY = "source_public_enabled";
const SOURCE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=300"
};

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: SOURCE_HEADERS
  });

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const db = await getDatabase(env);

    if (!(await isSourcePublic(db))) {
      return json(
        { error: "Public source is disabled." },
        { status: 404, headers: SOURCE_HEADERS }
      );
    }

    const result = await db.prepare(
      "SELECT * FROM tools ORDER BY updated_at DESC, created_at DESC"
    ).all<ToolRow>();

    return json(result.results.map(sourceToolFromRow), {
      headers: SOURCE_HEADERS
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load public source.";
    return json({ error: message }, { status: 400, headers: SOURCE_HEADERS });
  }
};

async function isSourcePublic(db: D1Database) {
  const row = await db.prepare("SELECT value FROM app_settings WHERE key = ?")
    .bind(SOURCE_PUBLIC_KEY)
    .first<{ value: string }>();

  if (!row) {
    return false;
  }

  try {
    const parsed = JSON.parse(row.value) as { enabled?: unknown };
    return parsed.enabled === true;
  } catch {
    return false;
  }
}

function sourceToolFromRow(row: ToolRow) {
  const tool = toolFromRow(row);

  return {
    updatedAt: (tool.updated_at || tool.created_at || new Date().toISOString()).slice(0, 10),
    id: tool.id,
    name: tool.name,
    url: tool.url,
    demoUrl: tool.demoUrl,
    image: tool.image,
    category: tool.category,
    description: tool.description,
    tags: tool.tags,
    featured: tool.featured
  };
}
