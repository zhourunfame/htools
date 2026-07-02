import {
  getDatabase,
  json,
  requireAdmin,
  toolFromRow,
  validateToolPayload,
  type Env,
  type ToolRow
} from "../../_shared";

export const onRequestPut: PagesFunction<Env> = async ({
  request,
  env,
  params
}) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const id = String(params.id);
    const db = await getDatabase(env);
    const payload = validateToolPayload((await request.json()) as object);
    const now = new Date().toISOString();

    await db.prepare(
      `UPDATE tools
       SET name = ?, description = ?, url = ?, demo_url = ?, image = ?, category = ?,
           tags = ?, github_language = ?, github_license = ?, featured = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
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
        id
      )
      .run();

    const row = await db.prepare("SELECT * FROM tools WHERE id = ?")
      .bind(id)
      .first<ToolRow>();

    if (!row) {
      return json({ error: "Tool not found." }, { status: 404 });
    }

    return json({ tool: toolFromRow(row) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update tool.";
    return json({ error: message }, { status: 400 });
  }
};

export const onRequestDelete: PagesFunction<Env> = async ({
  request,
  env,
  params
}) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  const id = String(params.id);
  const db = await getDatabase(env);
  await db.prepare("DELETE FROM tools WHERE id = ?").bind(id).run();
  return json({ ok: true });
};
