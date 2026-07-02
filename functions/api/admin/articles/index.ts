import {
  articleFromRow,
  createArticleId,
  createUniqueArticleSlug,
  getDatabase,
  json,
  requireAdmin,
  validateArticlePayload,
  type ArticleRow,
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
      `SELECT * FROM articles
       ORDER BY updated_at DESC, created_at DESC`
    ).all<ArticleRow>();

    return json({
      articles: result.results.map(articleFromRow)
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load articles.";
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
    const payload = validateArticlePayload((await request.json()) as object);
    const id = createArticleId();
    const slug = await createUniqueArticleSlug(db, payload.slug);
    const now = new Date().toISOString();
    const publishedAt = payload.published
      ? (payload.publishedAt ?? now)
      : payload.publishedAt;

    await db.prepare(
      `INSERT INTO articles
        (id, slug, title, summary, content, cover_image, category, tags, published, created_at, updated_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        slug,
        payload.title,
        payload.summary,
        payload.content,
        payload.coverImage,
        payload.category,
        JSON.stringify(payload.tags),
        payload.published ? 1 : 0,
        now,
        now,
        publishedAt
      )
      .run();

    const row = await db.prepare("SELECT * FROM articles WHERE id = ?")
      .bind(id)
      .first<ArticleRow>();

    return json({ article: row ? articleFromRow(row) : null }, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to create article.";
    return json({ error: message }, { status: 400 });
  }
};
