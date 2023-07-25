-- Up Migration

ALTER TABLE collections ALTER COLUMN token_id_range DROP NOT NULL;

-- Down Migration
