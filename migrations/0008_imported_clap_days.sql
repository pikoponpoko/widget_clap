-- Daily clap counts brought in from another clap service.
CREATE TABLE imported_clap_days (
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 claps INTEGER NOT NULL CHECK(claps>=0),
 visitors INTEGER NOT NULL DEFAULT 0 CHECK(visitors>=0),
 PRIMARY KEY(project_id,day)
);
