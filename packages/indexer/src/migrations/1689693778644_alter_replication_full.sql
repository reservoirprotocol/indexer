-- Up Migration

ALTER TABLE token_attributes REPLICA IDENTITY FULL;

-- Down Migration

ALTER TABLE token_attributes REPLICA IDENTITY DEFAULT;