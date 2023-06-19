-- Up Migration

CREATE TABLE "seaport_conduit_open_channels" (
  "conduit_key" BYTEA NOT NULL,
  "channel" BYTEA NOT NULL
);

ALTER TABLE "seaport_conduit_open_channels"
  ADD CONSTRAINT "seaport_conduit_open_channels_pk"
  PRIMARY KEY ("conduit_key", "channel");

-- Down Migration

DROP TABLE "seaport_conduit_open_channels";