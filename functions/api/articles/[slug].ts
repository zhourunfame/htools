import {
  articleFromRow,
  getDatabase,
  json,
  type ArticleRow,
  type Env
} from "../../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ env, params }) => {
  try {
    const slug = String(params.slug ?? "");
    const db = await getDatabase(env);
    const row = await db.prepare(
      "SELECT * FROM articles WHERE slug = ? AND published = 1"
    )
      .bind(slug)
      .first<ArticleRow>();

    if (!row) {
      return json({ error: "Article not found." }, { status: 404 });
    }

    return json({ article: articleFromRow(row) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to load article.";
    return json({ error: message }, { status: 500 });
  }
};
