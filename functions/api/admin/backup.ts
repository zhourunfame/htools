import {
  getDatabase,
  json,
  requireAdmin,
  type ArticleRow,
  type ContentItemRow,
  type ContentSourceRow,
  type Env,
  type ToolRow
} from "../../_shared";

type AppSettingRow = {
  key: string;
  value: string;
  updated_at: string;
};

type BackupCounts = {
  tools: number;
  articles: number;
  contentSources: number;
  contentItems: number;
  settings: number;
};

type BackupData = {
  tools: ToolRow[];
  articles: ArticleRow[];
  contentSources: ContentSourceRow[];
  contentItems: ContentItemRow[];
  settings: AppSettingRow[];
};

const BACKUP_SOURCE = "htools-backup";
const BACKUP_VERSION = "3";
const SAFE_SETTING_KEYS = [
  "source_public_enabled",
  "proxy_settings",
  "site_settings",
  "admin_category_settings"
] as const;

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const db = await getDatabase(env);
    const data = await readBackupData(db);
    const counts = createBackupCounts(data);

    return json({
      source: BACKUP_SOURCE,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      counts,
      data
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to export backup.";
    return json({ error: message }, { status: 400 });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const unauthorized = await requireAdmin(request, env);
  if (unauthorized) {
    return unauthorized;
  }

  try {
    const payload = (await request.json()) as unknown;
    const data = normalizeBackupPayload(payload);
    const db = await getDatabase(env);

    await restoreBackupData(db, data);

    return json({
      restored: true,
      counts: createBackupCounts(data)
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to restore backup.";
    return json({ error: message }, { status: 400 });
  }
};

async function readBackupData(db: D1Database): Promise<BackupData> {
  const [tools, articles, contentSources, contentItems, settings] =
    await Promise.all([
      db
        .prepare("SELECT * FROM tools ORDER BY updated_at DESC, created_at DESC")
        .all<ToolRow>(),
      db
        .prepare("SELECT * FROM articles ORDER BY updated_at DESC, created_at DESC")
        .all<ArticleRow>(),
      db
        .prepare(
          "SELECT * FROM content_sources ORDER BY updated_at DESC, created_at DESC"
        )
        .all<ContentSourceRow>(),
      db
        .prepare("SELECT * FROM content_items ORDER BY updated_at DESC, created_at DESC")
        .all<ContentItemRow>(),
      db
        .prepare(
          `SELECT key, value, updated_at
           FROM app_settings
           WHERE key IN (?, ?, ?, ?)
           ORDER BY key`
        )
        .bind(...SAFE_SETTING_KEYS)
        .all<AppSettingRow>()
    ]);

  return {
    tools: tools.results,
    articles: articles.results,
    contentSources: contentSources.results,
    contentItems: contentItems.results,
    settings: settings.results
  };
}

async function restoreBackupData(db: D1Database, data: BackupData) {
  const statements: D1PreparedStatement[] = [
    db.prepare("DELETE FROM content_items"),
    db.prepare("DELETE FROM content_sources"),
    db.prepare("DELETE FROM articles"),
    db.prepare("DELETE FROM tools"),
    ...SAFE_SETTING_KEYS.map((key) =>
      db.prepare("DELETE FROM app_settings WHERE key = ?").bind(key)
    ),
    ...data.tools.map((row) =>
      db
        .prepare(
          `INSERT INTO tools (
             id, name, description, url, demo_url, image, category, tags,
             github_language, github_license, featured, created_at, updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          row.name,
          row.description,
          row.url,
          row.demo_url ?? "",
          row.image,
          row.category,
          row.tags,
          row.github_language ?? "",
          row.github_license ?? "",
          row.featured,
          row.created_at,
          row.updated_at
        )
    ),
    ...data.articles.map((row) =>
      db
        .prepare(
          `INSERT INTO articles (
             id, slug, title, summary, content, cover_image, category, tags,
             published, created_at, updated_at, published_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          row.slug,
          row.title,
          row.summary,
          row.content,
          row.cover_image ?? "",
          row.category,
          row.tags,
          row.published,
          row.created_at,
          row.updated_at,
          row.published_at
        )
    ),
    ...data.contentSources.map((row) =>
      db
        .prepare(
          `INSERT INTO content_sources (
             id, title, url, site_url, description, category, tags, enabled,
             created_at, updated_at, last_synced_at
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          row.title,
          row.url,
          row.site_url ?? "",
          row.description,
          row.category,
          row.tags,
          row.enabled,
          row.created_at,
          row.updated_at,
          row.last_synced_at
        )
    ),
    ...data.contentItems.map((row) =>
      db
        .prepare(
          `INSERT INTO content_items (
             id, source_id, external_id, title, summary, content, url, author,
             cover_image, category, tags, published_at, synced_at, created_at,
             updated_at, article_id
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          row.id,
          row.source_id,
          row.external_id,
          row.title,
          row.summary,
          row.content,
          row.url,
          row.author,
          row.cover_image ?? "",
          row.category,
          row.tags,
          row.published_at,
          row.synced_at,
          row.created_at,
          row.updated_at,
          row.article_id
        )
    ),
    ...data.settings.map((row) =>
      db
        .prepare(
          `INSERT INTO app_settings (key, value, updated_at)
           VALUES (?, ?, ?)`
        )
        .bind(row.key, row.value, row.updated_at)
    )
  ];

  await db.batch(statements);
}

function normalizeBackupPayload(payload: unknown): BackupData {
  const root = readRecord(payload, "backup");

  if (root.source !== BACKUP_SOURCE || root.version !== BACKUP_VERSION) {
    throw new Error("backup file is not a supported full site backup.");
  }

  const data = readRecord(root.data, "backup.data");
  const now = new Date().toISOString();

  return {
    tools: readArray(data.tools, "tools").map((row, index) =>
      normalizeToolRow(row, index, now)
    ),
    articles: readArray(data.articles, "articles").map((row, index) =>
      normalizeArticleRow(row, index, now)
    ),
    contentSources: readArray(data.contentSources, "contentSources").map(
      (row, index) => normalizeContentSourceRow(row, index, now)
    ),
    contentItems: readArray(data.contentItems, "contentItems").map((row, index) =>
      normalizeContentItemRow(row, index, now)
    ),
    settings: readArray(data.settings, "settings")
      .map((row, index) => normalizeSettingRow(row, index, now))
      .filter((row): row is AppSettingRow => Boolean(row))
  };
}

function normalizeToolRow(value: unknown, index: number, now: string): ToolRow {
  const row = readRecord(value, `tools[${index}]`);
  const createdAt = readString(row.created_at) || now;

  return {
    id: readRequiredString(row.id, `tools[${index}].id`),
    name: readRequiredString(row.name, `tools[${index}].name`),
    description: readString(row.description),
    url: readRequiredString(row.url, `tools[${index}].url`),
    demo_url: readString(row.demo_url),
    image: readString(row.image),
    category: readRequiredString(row.category, `tools[${index}].category`),
    tags: normalizeTags(row.tags),
    github_language: readString(row.github_language),
    github_license: readString(row.github_license),
    featured: readIntegerFlag(row.featured),
    created_at: createdAt,
    updated_at: readString(row.updated_at) || createdAt
  };
}

function normalizeArticleRow(
  value: unknown,
  index: number,
  now: string
): ArticleRow {
  const row = readRecord(value, `articles[${index}]`);
  const createdAt = readString(row.created_at) || now;

  return {
    id: readRequiredString(row.id, `articles[${index}].id`),
    slug: readRequiredString(row.slug, `articles[${index}].slug`),
    title: readRequiredString(row.title, `articles[${index}].title`),
    summary: readString(row.summary),
    content: readString(row.content),
    cover_image: readString(row.cover_image),
    category: readString(row.category),
    tags: normalizeTags(row.tags),
    published: readIntegerFlag(row.published, 1),
    created_at: createdAt,
    updated_at: readString(row.updated_at) || createdAt,
    published_at: readNullableString(row.published_at)
  };
}

function normalizeContentSourceRow(
  value: unknown,
  index: number,
  now: string
): ContentSourceRow {
  const row = readRecord(value, `contentSources[${index}]`);
  const createdAt = readString(row.created_at) || now;

  return {
    id: readRequiredString(row.id, `contentSources[${index}].id`),
    title: readRequiredString(row.title, `contentSources[${index}].title`),
    url: readRequiredString(row.url, `contentSources[${index}].url`),
    site_url: readString(row.site_url),
    description: readString(row.description),
    category: readString(row.category),
    tags: normalizeTags(row.tags),
    enabled: readIntegerFlag(row.enabled, 1),
    created_at: createdAt,
    updated_at: readString(row.updated_at) || createdAt,
    last_synced_at: readNullableString(row.last_synced_at)
  };
}

function normalizeContentItemRow(
  value: unknown,
  index: number,
  now: string
): ContentItemRow {
  const row = readRecord(value, `contentItems[${index}]`);
  const createdAt = readString(row.created_at) || now;

  return {
    id: readRequiredString(row.id, `contentItems[${index}].id`),
    source_id: readRequiredString(row.source_id, `contentItems[${index}].source_id`),
    external_id: readRequiredString(row.external_id, `contentItems[${index}].external_id`),
    title: readRequiredString(row.title, `contentItems[${index}].title`),
    summary: readString(row.summary),
    content: readString(row.content),
    url: readRequiredString(row.url, `contentItems[${index}].url`),
    author: readString(row.author),
    cover_image: readString(row.cover_image),
    category: readString(row.category),
    tags: normalizeTags(row.tags),
    published_at: readNullableString(row.published_at),
    synced_at: readString(row.synced_at) || now,
    created_at: createdAt,
    updated_at: readString(row.updated_at) || createdAt,
    article_id: readNullableString(row.article_id)
  };
}

function normalizeSettingRow(
  value: unknown,
  index: number,
  now: string
): AppSettingRow | null {
  const row = readRecord(value, `settings[${index}]`);
  const key = readString(row.key);

  if (!isSafeSettingKey(key)) {
    return null;
  }

  return {
    key,
    value: readString(row.value),
    updated_at: readString(row.updated_at) || now
  };
}

function createBackupCounts(data: BackupData): BackupCounts {
  return {
    tools: data.tools.length,
    articles: data.articles.length,
    contentSources: data.contentSources.length,
    contentItems: data.contentItems.length,
    settings: data.settings.length
  };
}

function readRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${field} must be an object.`);
  }

  return value as Record<string, unknown>;
}

function readArray(value: unknown, field: string): unknown[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }

  return value;
}

function readRequiredString(value: unknown, field: string) {
  const text = readString(value);

  if (!text) {
    throw new Error(`${field} is required.`);
  }

  return text;
}

function readString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown) {
  return typeof value === "string" && value ? value : null;
}

function readIntegerFlag(value: unknown, fallback = 0) {
  if (value === true) {
    return 1;
  }

  if (value === false) {
    return 0;
  }

  if (typeof value === "number") {
    return value === 1 ? 1 : 0;
  }

  return fallback;
}

function normalizeTags(value: unknown) {
  if (Array.isArray(value)) {
    return JSON.stringify(
      value.filter((tag): tag is string => typeof tag === "string")
    );
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;

      if (Array.isArray(parsed)) {
        return JSON.stringify(
          parsed.filter((tag): tag is string => typeof tag === "string")
        );
      }
    } catch {
      return "[]";
    }
  }

  return "[]";
}

function isSafeSettingKey(value: string): value is (typeof SAFE_SETTING_KEYS)[number] {
  return (SAFE_SETTING_KEYS as readonly string[]).includes(value);
}
