-- Up Migration

ALTER TABLE "collections" ADD "token_indexing_method" TEXT;

-- Down Migration