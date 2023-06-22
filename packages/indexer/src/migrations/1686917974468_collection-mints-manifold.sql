-- Up Migration

ALTER TYPE "collection_mint_standard_t" ADD VALUE 'manifold';

ALTER TABLE "collection_mints" ADD COLUMN "token_id" NUMERIC(78, 0);

-- Down Migration