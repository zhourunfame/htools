import {
  contentSourceFromRow,
  fetchFeedPreview,
  getDatabase,
  json,
  requireAdmin,
  validateContentSourcePayload,
  type ContentSourceRow,
  type Env
} from "../../../_shared";

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
    const id = String(params.id ?? "");
    const db = await getDatabase(env);
    const existing = await db.prepare("SELECT * FROM content_sources WHERE id = ?")
      .bind(id)
      .first<ContentSourceRow>();

    if (!existing) {
      return json({ error: "Content source not found." }, { status: 404 });
    }

    const payload = validateContentSourcePayload(
      (await request.json()) as object
    );
    const preview =
      payload.url !== existing.url ? await fetchFeedPreview(payload.url) : null;
    const now = new Date().toISOString();

    await db.prepare(
      `UPDATE content_sources
       SET title = ?, url = ?, site_url = ?, description = ?,
           category = ?, tags = ?, enabled = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        payload.title || preview?.title || existing.title,
        payload.url,
        payload.siteUrl || preview?.siteUrl || existing.site_url,
        payload.description || preview?.description || existing.description,
        payload.category,
        JSON.stringify(payload.tags),
        payload.enabled ? 1 : 0,
        now,
        id
      )
      .run();

    await db.prepare(
      `UPDATE content_items
       SET category = ?, updated_at = ?
       WHERE source_id = ?`
    )
      .bind(payload.category, now, id)
      .run();

    const row = await db.prepare("SELECT * FROM content_sources WHERE id = ?")
      .bind(id)
      .first<ContentSourceRow>();

    return json({ source: row ? contentSourceFromRow(row) : null });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update content source.";
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

  const id = String(params.id ?? "");
  const db = await getDatabase(env);
  await db.prepare("DELETE FROM content_items WHERE source_id = ?").bind(id).run();
  await db.prepare("DELETE FROM content_sources WHERE id = ?").bind(id).run();
  return json({ ok: true });
};
