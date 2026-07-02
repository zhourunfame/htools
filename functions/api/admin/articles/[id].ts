import {
  articleFromRow,
  createUniqueArticleSlug,
  getDatabase,
  json,
  requireAdmin,
  validateArticlePayload,
  type ArticleRow,
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
    const existing = await db.prepare("SELECT * FROM articles WHERE id = ?")
      .bind(id)
      .first<ArticleRow>();

    if (!existing) {
      return json({ error: "Article not found." }, { status: 404 });
    }

    const payload = validateArticlePayload((await request.json()) as object);
    const slug = await createUniqueArticleSlug(db, payload.slug, id);
    const now = new Date().toISOString();
    const publishedAt = payload.published
      ? (payload.publishedAt ?? now)
      : payload.publishedAt;

    await db.prepare(
      `UPDATE articles
       SET slug = ?, title = ?, summary = ?, content = ?, cover_image = ?,
           category = ?, tags = ?, published = ?, updated_at = ?, published_at = ?
       WHERE id = ?`
    )
      .bind(
        slug,
        payload.title,
        payload.summary,
        payload.content,
        payload.coverImage,
        payload.category,
        JSON.stringify(payload.tags),
        payload.published ? 1 : 0,
        now,
        publishedAt,
        id
      )
      .run();

    const row = await db.prepare("SELECT * FROM articles WHERE id = ?")
      .bind(id)
      .first<ArticleRow>();

    return json({ article: row ? articleFromRow(row) : null });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to update article.";
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
  await db.prepare("DELETE FROM articles WHERE id = ?").bind(id).run();
  await db.prepare("UPDATE content_items SET article_id = NULL WHERE article_id = ?")
    .bind(id)
    .run();
  return json({ ok: true });
};
