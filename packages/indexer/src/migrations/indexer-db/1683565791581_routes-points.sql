-- Up Migration

CREATE TABLE "api_routes_points" (
  "route" TEXT NOT NULL,
  "points" INT NOT NULL
);

ALTER TABLE "api_routes_points"
  ADD CONSTRAINT "api_routes_points_pk"
  PRIMARY KEY ("route");

-- Down Migration

DROP TABLE "api_routes_points";