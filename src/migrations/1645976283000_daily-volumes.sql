-- Up Migration

CREATE TABLE "daily_volumes" (
  "collection_id" TEXT NOT NULL,
  "timestamp" INT NOT NULL,
  "volume" NUMERIC(78, 0) NOT NULL,
  "rank" INT NOT NULL
);

ALTER TABLE "daily_volumes"
  ADD CONSTRAINT "daily_volumes_pk"
  PRIMARY KEY ("collection_id", "timestamp");

ALTER TABLE "collections"
  ADD "day1_volume" NUMERIC(78, 0) DEFAULT 0;

ALTER TABLE "collections"
  ADD "day1_rank" INT;

ALTER TABLE "collections"
  ADD "day7_volume" NUMERIC(78, 0) DEFAULT 0;

ALTER TABLE "collections"
  ADD "day7_rank" INT;

ALTER TABLE "collections"
  ADD "day30_volume" NUMERIC(78, 0) DEFAULT 0;

ALTER TABLE "collections"
  ADD "day30_rank" INT;

ALTER TABLE "collections"
  ADD "all_time_volume" NUMERIC(78, 0) DEFAULT 0;

ALTER TABLE "collections"
  ADD "all_time_rank" INT;

CREATE INDEX "fill_events_2_timestamp_index"
  ON "fill_events_2" ("timestamp");

CREATE INDEX "collections_day1_volume_index"
  ON "collections" ("day1_volume" DESC);

CREATE INDEX "collections_day7_volume_index"
    ON "collections" ("day7_volume" DESC);

CREATE INDEX "collections_day30_volume_index"
    ON "collections" ("day30_volume" DESC);

CREATE INDEX "collections_all_time_volume_index"
  ON "collections" ("all_time_volume" DESC);

-- Down Migration

DROP TABLE "daily_volumes";

ALTER TABLE "collections"
  DROP COLUMN "all_time_volume";

ALTER TABLE "collections"
  DROP COLUMN "all_time_rank";

ALTER TABLE "collections"
  DROP COLUMN "day30_volume";

ALTER TABLE "collections"
  DROP COLUMN "day30_rank";

  ALTER TABLE "collections"
  DROP COLUMN "day7_volume";

ALTER TABLE "collections"
  DROP COLUMN "day7_rank";

ALTER TABLE "collections"
  DROP COLUMN "day1_volume";

ALTER TABLE "collections"
  DROP COLUMN "day1_rank";
