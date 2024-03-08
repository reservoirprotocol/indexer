-- Up Migration

CREATE TABLE "payment_processor_v201_user_nonces" (
  "user" BYTEA NOT NULL,
  "marketplace" BYTEA NOT NULL,
  "nonce" NUMERIC(78, 0),
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE "payment_processor_v201_user_nonces"
  ADD CONSTRAINT "payment_processor_v201_user_nonces_pk"
  PRIMARY KEY ("user", "marketplace");

ALTER TYPE "order_kind_t" ADD VALUE 'payment-processor-v2.0.1';

-- Down Migration

DROP TABLE "payment_processor_v201_user_nonces";
