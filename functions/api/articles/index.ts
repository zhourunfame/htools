import {
  articleFromRow,
  getDatabase,
  json,
  type ArticleRow,
  type Env
} from "../../_shared";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const db = await getDatabase(env);
    const result = await db.prepare(
      `SELECT * FROM articles
       WHERE published = 1
       ORDER BY COALESCE(published_at, updated_at, created_at) DESC`
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
