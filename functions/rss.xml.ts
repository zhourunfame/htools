import {
  getDatabase,
  getSiteSettings,
  type ArticleRow,
  type Env
} from "./_shared";

const RSS_HEADERS = {
  "Cache-Control": "public, max-age=300",
  "Content-Type": "application/rss+xml; charset=utf-8"
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const origin = new URL(request.url).origin;
  const site = await loadPublicSiteSettings(env);
  const articles = await loadPublishedArticles(env);
  const now = new Date();

  const items = articles.map((article) => {
    const link = new URL(`/articles/${encodeURIComponent(article.slug)}`, origin)
      .toString();
    const publishedAt = parseDate(
      article.published_at ?? article.updated_at ?? article.created_at
    );
    const tags = parseTags(article.tags);

    return [
      "    <item>",
      `      <title>${escapeXml(article.title)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
      `      <description>${escapeXml(stripMarkdown(article.summary || article.content))}</description>`,
      publishedAt ? `      <pubDate>${publishedAt.toUTCString()}</pubDate>` : "",
      ...tags.map((tag) => `      <category>${escapeXml(tag)}</category>`),
      "    </item>"
    ].filter(Boolean).join("\n");
  });

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${escapeXml(site.name)}</title>`,
    `    <link>${escapeXml(origin)}</link>`,
    `    <description>${escapeXml(site.subtitle)}</description>`,
    `    <lastBuildDate>${now.toUTCString()}</lastBuildDate>`,
    `    <atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${escapeXml(
      new URL("/rss.xml", origin).toString()
    )}" rel="self" type="application/rss+xml" />`,
    ...items,
    "  </channel>",
    "</rss>",
    ""
  ].join("\n");

  return new Response(xml, { headers: RSS_HEADERS });
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
    .slice(0, 500);
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
