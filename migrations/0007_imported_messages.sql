-- Messages brought in from another clap service. '' = received by Hakushu.
ALTER TABLE messages ADD COLUMN source TEXT NOT NULL DEFAULT '' CHECK(source IN('','import'));
