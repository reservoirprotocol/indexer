-- Up Migration

CREATE TABLE "payment_processor_v2_trusted_channels" (
  "contract" BYTEA NOT NULL,
  "channel" BYTEA NOT NULL,
  "signer" BYTEA NOT NULL
);

ALTER TABLE "payment_processor_v2_trusted_channels"
  ADD CONSTRAINT "payment_processor_v2_trusted_channels_pk"
  PRIMARY KEY ("contract", "channel");

-- Down Migration

DROP TABLE "payment_processor_v2_trusted_channels";