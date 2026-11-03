-- Every embedded button reads its project's images; without this the whole assets table is scanned.
CREATE INDEX assets_project_order ON assets(project_id,sort_order,created_at,id);
