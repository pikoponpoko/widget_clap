-- Keyed hash of a random id kept in the clapping browser. Mobile lines change
-- address often, so the network id alone rarely sees the same person again.
ALTER TABLE claps ADD COLUMN browser TEXT NOT NULL DEFAULT '';
CREATE INDEX claps_browser ON claps(browser) WHERE browser<>'';
