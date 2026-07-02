import {
  createId,
  getDatabase,
  json,
  requireAdmin,
  toolFromRow,
  validateToolPayload,
  type Env,
  type ToolRow
} from "../../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const db = await getDatabase(env);
    const result = await db.prepare(
      "SELECT * FROM tools ORDER BY updated_at DESC, created_at DESC"
    ).all<ToolRow>();

    return json({
      tools: result.results.map(toolFromRow)
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load tools.";
    return json({ error: message }, { status: 500 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const db = await getDatabase(env);
    const payload = validateToolPayload((await request.json()) as object);
    const id = createId(payload.name);
    const now = new Date().toISOString();

    await db.prepare(
      `INSERT INTO tools
        (id, name, description, url, demo_url, image, category, tags,
         github_language, github_license, featured, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        payload.name,
        payload.description,
        payload.url,
        payload.demoUrl,
        payload.image,
        payload.category,
        JSON.stringify(payload.tags),
        payload.githubLanguage,
        payload.githubLicense,
        payload.featured ? 1 : 0,
        now,
        now
      )
      .run();

    const row = await db.prepare("SELECT * FROM tools WHERE id = ?")
      .bind(id)
      .first<ToolRow>();

    return json({ tool: row ? toolFromRow(row) : null }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create tool.";
    return json({ error: message }, { status: 400 });
  }
};
