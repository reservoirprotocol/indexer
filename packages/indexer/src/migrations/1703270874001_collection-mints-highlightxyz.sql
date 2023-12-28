-- Up Migration

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'highlightxyz';

ALTER TABLE "collection_mints" ADD COLUMN "max_mints_per_transaction" NUMERIC(78, 0);

-- Down Migration