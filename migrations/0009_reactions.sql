-- Reaction buttons on the thank-you screen. Chosen kinds per site, in order.
ALTER TABLE projects ADD COLUMN reactions TEXT NOT NULL DEFAULT '["heart","fire","hundred"]';
CREATE TABLE reactions (
 id TEXT PRIMARY KEY,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 kind TEXT NOT NULL,
 created_at TEXT NOT NULL,
 dedupe_key TEXT NOT NULL UNIQUE,
 page_url TEXT NOT NULL DEFAULT '',
 page_title TEXT NOT NULL DEFAULT '',
 visitor TEXT NOT NULL DEFAULT ''
);
CREATE INDEX reactions_project_date ON reactions(project_id,created_at);
