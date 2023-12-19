-- Up Migration

ALTER TABLE contracts ADD COLUMN owner BYTEA;

-- Down Migration

ALTER TABLE contracts DROP COLUMN owner;

