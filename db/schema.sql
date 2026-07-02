CREATE TABLE IF NOT EXISTS tools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  url TEXT NOT NULL,
  demo_url TEXT NOT NULL DEFAULT '',
  image TEXT NOT NULL,
  category TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  github_language TEXT NOT NULL DEFAULT '',
  github_license TEXT NOT NULL DEFAULT '',
  featured INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tools_category ON tools (category);
CREATE INDEX IF NOT EXISTS idx_tools_featured ON tools (featured);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  cover_image TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  published INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  published_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_articles_published
  ON articles (published, published_at);
CREATE INDEX IF NOT EXISTS idx_articles_slug
  ON articles (slug);
CREATE INDEX IF NOT EXISTS idx_articles_category
  ON articles (category, published_at);

CREATE TABLE IF NOT EXISTS content_sources (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  site_url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_content_sources_category
  ON content_sources (category);

CREATE TABLE IF NOT EXISTS content_items (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  author TEXT NOT NULL DEFAULT '',
  cover_image TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '[]',
  published_at TEXT,
  synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  article_id TEXT,
  UNIQUE(source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_content_items_source
  ON content_items (source_id);
CREATE INDEX IF NOT EXISTS idx_content_items_category
  ON content_items (category, published_at);

CREATE TABLE IF NOT EXISTS github_oauth_states (
  state TEXT PRIMARY KEY,
  return_to TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_oauth_states_expires_at
  ON github_oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS github_sessions (
  token TEXT PRIMARY KEY,
  github_id INTEGER NOT NULL,
  github_login TEXT NOT NULL,
  github_name TEXT,
  avatar_url TEXT NOT NULL,
  html_url TEXT NOT NULL,
  access_token TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_sessions_expires_at
  ON github_sessions (expires_at);
