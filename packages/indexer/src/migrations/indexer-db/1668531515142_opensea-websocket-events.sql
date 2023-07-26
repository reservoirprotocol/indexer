-- Up Migration

CREATE TABLE "opensea_websocket_events" (
  "event_type" TEXT NOT NULL,
  "event_timestamp" TIMESTAMPTZ NOT NULL,
  "order_hash" TEXT,
  "maker" TEXT,
  "data" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "opensea_websocket_events_order_hash_index"
  ON "opensea_websocket_events" ("order_hash");

-- Down Migration

DROP TABLE "opensea_websocket_events";