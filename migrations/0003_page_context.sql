ALTER TABLE claps ADD COLUMN page_url TEXT NOT NULL DEFAULT '';
ALTER TABLE claps ADD COLUMN page_title TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN page_url TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN page_title TEXT NOT NULL DEFAULT '';
CREATE INDEX claps_project_page ON claps(project_id,page_url);
