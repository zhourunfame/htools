import {
  contentSourceFromRow,
  createContentSourceId,
  fetchFeedPreview,
  getDatabase,
  json,
  requireAdmin,
  validateContentSourcePayload,
  type ContentSourceRow,
  type Env
} from "../../../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const db = await getDatabase(env);
    const result = await db.prepare(
      `SELECT * FROM content_sources
       ORDER BY updated_at DESC, created_at DESC`
    ).all<ContentSourceRow>();

    return json({
      sources: result.results.map(contentSourceFromRow)
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load content sources.";
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
    const payload = validateContentSourcePayload(
      (await request.json()) as object
    );
    const preview = await fetchFeedPreview(payload.url);
    const now = new Date().toISOString();
    const id = createContentSourceId();

    await db.prepare(
      `INSERT INTO content_sources
        (id, title, url, site_url, description, category, tags,
         enabled, created_at, updated_at, last_synced_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        payload.title || preview.title,
        payload.url,
        payload.siteUrl || preview.siteUrl,
        payload.description || preview.description,
        payload.category,
        JSON.stringify(payload.tags),
        payload.enabled ? 1 : 0,
        now,
        now,
        null
      )
      .run();

    const row = await db.prepare("SELECT * FROM content_sources WHERE id = ?")
      .bind(id)
      .first<ContentSourceRow>();

    return json({ source: row ? contentSourceFromRow(row) : null }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create content source.";
    return json({ error: message }, { status: 400 });
  }
};
