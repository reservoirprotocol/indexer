-- Up Migration

ALTER TABLE contracts ADD COLUMN metadata JSONB;
ALTER TABLE contracts ADD COLUMN deployer BYTEA;

-- Down Migration

ALTER TABLE contracts DROP COLUMN metadata
ALTER TABLE contracts DROP COLUMN deployer

