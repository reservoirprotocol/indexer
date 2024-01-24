-- Up Migration

ALTER TABLE "fee_recipients" ADD COLUMN "created_at" TIMESTAMPTZ NOT NULL DEFAULT now();

-- Down Migration
