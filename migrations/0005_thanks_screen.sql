ALTER TABLE projects ADD COLUMN thanks_order TEXT NOT NULL DEFAULT 'random' CHECK(thanks_order IN('random','sequential','fixed'));
UPDATE projects SET thanks_order=thanks_mode;
ALTER TABLE projects ADD COLUMN thanks_message TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN sender_name TEXT NOT NULL DEFAULT '';
ALTER TABLE messages ADD COLUMN reply_wanted INTEGER CHECK(reply_wanted IN(0,1));
ALTER TABLE assets ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
