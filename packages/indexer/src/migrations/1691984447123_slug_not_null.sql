-- Up Migration

ALTER TABLE "collections" ALTER COLUMN "slug" DROP NOT NULL;

-- Down Migration

ALTER TABLE "collections" ALTER COLUMN "slug" SET NOT NULL;