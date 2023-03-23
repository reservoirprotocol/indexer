-- Up Migration

CREATE TABLE "hourly_api_usage" (
  "api_key" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "api_calls_count" INT NOT NULL DEFAULT 0,
  "status_code" INT NOT NULL,
  "points" INT NOT NULL DEFAULT 0,
  "hour" TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX "hourly_api_usage_hour_api_key_route_status_code_unique_index"
  ON "hourly_api_usage" ("hour", "api_key", "route", "status_code");

CREATE TABLE "daily_api_usage" (
  "api_key" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "api_calls_count" INT NOT NULL DEFAULT 0,
  "status_code" INT NOT NULL,
  "points" INT NOT NULL DEFAULT 0,
  "day" TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX "daily_api_usage_day_api_key_route_status_code_unique_index"
  ON "daily_api_usage" ("day", "api_key", "route", "status_code");

CREATE TABLE "monthly_api_usage" (
  "api_key" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "api_calls_count" INT NOT NULL DEFAULT 0,
  "status_code" INT NOT NULL,
  "points" INT NOT NULL DEFAULT 0,
  "month" TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX "monthly_api_usage_month_api_key_route_status_code_unique_index"
  ON "monthly_api_usage" ("month", "api_key", "route", "status_code");

-- Down Migration

DROP TABLE "hourly_api_usage";
DROP TABLE "daily_api_usage";
DROP TABLE "monthly_api_usage";