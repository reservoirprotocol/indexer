-- Up Migration
ALTER TABLE "tokens" ADD COLUMN "token_uri" TEXT;

-- Down Migration
ALTER TABLE "tokens" DROP COLUMN "token_uri";