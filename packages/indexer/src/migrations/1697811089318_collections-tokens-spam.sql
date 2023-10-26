-- Up Migration

ALTER TABLE "collections" ADD COLUMN "is_spam" INT;
ALTER TABLE "tokens" ADD COLUMN "is_spam" INT;

-- Down Migration

ALTER TABLE "collections" DROP COLUMN "is_spam";
ALTER TABLE "tokens" DROP COLUMN "is_spam";