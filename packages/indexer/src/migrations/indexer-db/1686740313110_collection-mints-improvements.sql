-- Up Migration

ALTER TYPE "collection_mint_kind_t" ADD VALUE 'zora';

ALTER TABLE "collection_mints" ADD COLUMN "max_supply" NUMERIC(78, 0);

-- Down Migration