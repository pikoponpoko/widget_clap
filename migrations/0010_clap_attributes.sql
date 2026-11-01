-- Who clapped (region, language, device, referrer, screen, first time or not), as JSON. Empty for older claps.
ALTER TABLE claps ADD COLUMN attrs TEXT NOT NULL DEFAULT '';
CREATE INDEX claps_visitor ON claps(visitor,created_at);
