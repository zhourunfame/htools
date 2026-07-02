import {
  getDatabase,
  json,
  normalizeFeedItemSummary,
  normalizeFeedItemTitle,
  requireAdmin,
  type ContentItemRow,
  type Env
} from "../../../../_shared";

export const onRequestGet: PagesFunction<Env> = async ({
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
    const item = await db.prepare(
      `SELECT content_items.*, content_sources.title AS source_title,
              content_sources.url AS source_url
       FROM content_items
       JOIN content_sources ON content_sources.id = content_items.source_id
       WHERE content_items.id = ?`
    )
      .bind(id)
      .first<ContentItemRow>();

    if (!item) {
      return json({ error: "Content item not found." }, { status: 404 });
    }

    const contentBody = item.content || item.summary || item.title;
    const content = `${contentBody}\n\n## \u539f\u6587\u94fe\u63a5\n\n[\u9605\u8bfb\u539f\u6587](${item.url})`;
    const now = new Date().toISOString();
    const title = normalizeFeedItemTitle(item.title, contentBody, item.summary);
    const summary = normalizeFeedItemSummary(item.summary, contentBody, title);

    return json({
      article: {
        id: `content-preview-${item.id}`,
        slug: `content-preview-${item.id}`,
        title,
        summary: summary || title,
        content,
        coverImage: item.cover_image ?? "",
        category: item.category,
        tags: safelyParseTags(item.tags),
        published: false,
        created_at: item.created_at ?? now,
        updated_at: item.updated_at ?? now,
        published_at: item.published_at,
        publishedAt: item.published_at
      }
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to load content item preview.";
    return json({ error: message }, { status: 500 });
  }
};

function safelyParseTags(value: string) {
  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}
