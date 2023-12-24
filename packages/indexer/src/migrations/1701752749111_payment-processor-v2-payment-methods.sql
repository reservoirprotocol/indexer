-- Up Migration

CREATE TABLE "payment_processor_v2_payment_methods" (
  "id" INT NOT NULL,
  "payment_method" BYTEA NOT NULL
);

ALTER TABLE "payment_processor_v2_payment_methods"
  ADD CONSTRAINT "payment_processor_v2_payment_methods_pk"
  PRIMARY KEY ("id", "payment_method");

-- Down Migration

DROP TABLE "payment_processor_v2_payment_methods";