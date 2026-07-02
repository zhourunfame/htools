import {
  getDatabase,
  type ArticleRow,
  type Env
} from "./_shared";

const SITEMAP_HEADERS = {
  "Cache-Control": "public, max-age=300",
  "Content-Type": "application/xml; charset=utf-8"
};

type SitemapArticleRow = Pick<
  ArticleRow,
  "slug" | "updated_at" | "published_at" | "created_at"
>;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const origin = new URL(request.url).origin;
  const urls = [
    createUrlEntry(origin, "/", "daily", "1.0"),
    createUrlEntry(origin, "/tools", "daily", "0.8"),
    createUrlEntry(origin, "/articles", "daily", "0.8"),
    createUrlEntry(origin, "/submit", "monthly", "0.5"),
    createUrlEntry(origin, "/about", "monthly", "0.5"),
    createUrlEntry(origin, "/privacy", "yearly", "0.3"),
    createUrlEntry(origin, "/terms", "yearly", "0.3")
  ];

  try {
    const db = await getDatabase(env);
    const result = await db.prepare(
      `SELECT slug, updated_at, published_at, created_at
       FROM articles
       WHERE published = 1
       ORDER BY COALESCE(published_at, updated_at, created_at) DESC
       LIMIT 1000`
    ).all<SitemapArticleRow>();

    urls.push(
      ...result.results.map((article) =>
        createUrlEntry(
          origin,
          `/articles/${encodeURIComponent(article.slug)}`,
          "weekly",
          "0.7",
          article.published_at ?? article.updated_at ?? article.created_at
        )
      )
    );
  } catch {
    // Keep the sitemap useful even when a fresh deployment has not bound D1 yet.
  }

  return new Response(createSitemap(urls), {
    headers: SITEMAP_HEADERS
  });
};

function createSitemap(urls: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;
}

function createUrlEntry(
  origin: string,
  path: string,
  changefreq: string,
  priority: string,
  lastmod = ""
) {
  const normalizedLastmod = normalizeSitemapDate(lastmod);

  return [
    "  <url>",
    `    <loc>${escapeXml(new URL(path, origin).toString())}</loc>`,
    normalizedLastmod ? `    <lastmod>${normalizedLastmod}</lastmod>` : "",
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>"
  ].filter(Boolean).join("\n");
}

function normalizeSitemapDate(value: string) {
  const date = parseDate(value);

  return date ? date.toISOString().slice(0, 10) : "";
}

function parseDate(value: string) {
  if (!value) {
    return null;
  }

  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? null : date;
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
