ALTER TABLE projects ADD COLUMN thanks_enabled INTEGER NOT NULL DEFAULT 1 CHECK(thanks_enabled IN(0,1));
ALTER TABLE projects ADD COLUMN reply_enabled INTEGER NOT NULL DEFAULT 1 CHECK(reply_enabled IN(0,1));
ALTER TABLE projects ADD COLUMN tip_enabled INTEGER NOT NULL DEFAULT 0 CHECK(tip_enabled IN(0,1));
