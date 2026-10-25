PRAGMA foreign_keys=ON;
CREATE TABLE projects (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL DEFAULT 'owner' CHECK(owner_id='owner'),
 title TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT NOT NULL DEFAULT '', site_url TEXT NOT NULL DEFAULT '',
 allowed_origins TEXT NOT NULL DEFAULT '[]', clap_enabled INTEGER NOT NULL DEFAULT 1 CHECK(clap_enabled IN(0,1)), message_enabled INTEGER NOT NULL DEFAULT 1 CHECK(message_enabled IN(0,1)),
 favorite_enabled INTEGER NOT NULL DEFAULT 1 CHECK(favorite_enabled IN(0,1)), thanks_mode TEXT NOT NULL DEFAULT 'random' CHECK(thanks_mode IN('fixed','random')),
 tip_url TEXT NOT NULL DEFAULT '', tip_legal_checked INTEGER NOT NULL DEFAULT 0, tip_terms_checked INTEGER NOT NULL DEFAULT 0, tip_privacy_checked INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE claps (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, created_at TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE);
CREATE INDEX claps_project_date ON claps(project_id,created_at);
CREATE TABLE messages (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, body TEXT NOT NULL,
 created_at TEXT NOT NULL, read_at TEXT, publication_consent INTEGER NOT NULL DEFAULT 0 CHECK(publication_consent IN(0,1)),
 reply_token_hash TEXT UNIQUE, dedupe_key TEXT NOT NULL UNIQUE, blocked INTEGER NOT NULL DEFAULT 0 CHECK(blocked IN(0,1))
);
CREATE INDEX messages_project_date ON messages(project_id,created_at);
CREATE TABLE replies (id TEXT PRIMARY KEY, message_id TEXT NOT NULL UNIQUE REFERENCES messages(id) ON DELETE CASCADE, body TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE assets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL CHECK(kind IN('button','thanks')), storage_key TEXT NOT NULL UNIQUE, mime TEXT NOT NULL, size INTEGER NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at INTEGER NOT NULL);
CREATE TABLE audit_logs (id TEXT PRIMARY KEY, action TEXT NOT NULL, target_id TEXT, created_at TEXT NOT NULL);
CREATE TABLE backup_runs (id TEXT PRIMARY KEY, storage_key TEXT NOT NULL, created_at TEXT NOT NULL, asset_count INTEGER NOT NULL);
