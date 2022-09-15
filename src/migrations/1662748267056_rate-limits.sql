-- Up Migration

CREATE TABLE "rate_limit_rules" (
  id SERIAL PRIMARY KEY,
  route TEXT NOT NULL,
  method TEXT NOT NULL DEFAULT '',
  tier INT,
  api_key TEXT NOT NULL DEFAULT '',
  options JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO "rate_limit_rules" (route, tier, options)
VALUES('/', 0, '{"points":300,"duration":60}');

INSERT INTO "rate_limit_rules" (route, tier, options)
VALUES('/', 1, '{"points":900,"duration":60}');

INSERT INTO "rate_limit_rules" (route, tier, options)
VALUES('/', 2, '{"points":1800,"duration":60}');

INSERT INTO "rate_limit_rules" (route, tier, options)
VALUES('/', 3, '{"points":6000,"duration":60}');

-- Down Migration

DROP TABLE "rate_limit_rules";