-- The dashboard counts every site by date, which the project-first indexes cannot narrow.
CREATE INDEX claps_date ON claps(created_at);
CREATE INDEX messages_date ON messages(created_at);
CREATE INDEX reactions_date ON reactions(created_at);
