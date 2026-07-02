import {
  getDatabase,
  getSiteSettings,
  type ArticleRow,
  type Env
} from "./_shared";

const JSON_FEED_HEADERS = {
  "Cache-Control": "public, max-age=300",
  "Content-Type": "application/feed+json; charset=utf-8"
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const origin = new URL(request.url).origin;
  const site = await loadPublicSiteSettings(env);
  const articles = await loadPublishedArticles(env);

  return new Response(
    JSON.stringify(
      {
        version: "https://jsonfeed.org/version/1.1",
        title: site.name,
        description: site.subtitle,
        home_page_url: origin,
        feed_url: new URL("/rss.json", origin).toString(),
        icon: site.iconUrl || undefined,
        favicon: site.iconUrl || undefined,
        items: articles.map((article) => {
          const url = new URL(
            `/articles/${encodeURIComponent(article.slug)}`,
            origin
          ).toString();
          const publishedAt = parseDate(
            article.published_at ?? article.updated_at ?? article.created_at
          );
          const updatedAt = parseDate(article.updated_at ?? article.created_at);

          return {
            id: url,
            url,
            title: article.title,
            summary: stripMarkdown(article.summary || article.content),
            content_text: stripMarkdown(article.content || article.summary),
            image: article.cover_image || undefined,
            date_published: publishedAt?.toISOString(),
            date_modified: updatedAt?.toISOString(),
            tags: parseTags(article.tags)
          };
        })
      },
      null,
      2
    ),
    { headers: JSON_FEED_HEADERS }
  );
};

async function loadPublishedArticles(env: Env) {
  try {
    const db = await getDatabase(env);
    const result = await db.prepare(
      `SELECT *
       FROM articles
       WHERE published = 1
       ORDER BY COALESCE(published_at, updated_at, created_at) DESC
       LIMIT 50`
    ).all<ArticleRow>();

    return result.results;
  } catch {
    return [];
  }
}

async function loadPublicSiteSettings(env: Env) {
  try {
    return await getSiteSettings(env);
  } catch {
    return {
      name: "HTools",
      subtitle: "工具导航站",
      iconUrl: ""
    };
  }
}

function parseTags(value: string) {
  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === "string")
      : [];
  } catch {
    return [];
  }
}

function parseDate(value: string) {
  if (!value) {
    return null;
  }

  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function stripMarkdown(value: string) {
  return value
    .replace(/`{3,}[\s\S]*?`{3,}/g, " ")
    .replace(/!\[([^\]]*)\]\((?:[^)(]|\([^)]*\))*\)/g, "$1")
    .replace(/\[([^\]]+)\]\((?:[^)(]|\([^)]*\))*\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+(?:#[\p{L}\p{N}_-]+\s*){2,}(?:频道\s*[|｜]\s*聊天)?\s*$/u, "")
    .replace(/[*_~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}
