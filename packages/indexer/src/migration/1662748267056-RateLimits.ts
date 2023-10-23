import { MigrationInterface, QueryRunner } from "typeorm";
export class RateLimits1662748267056 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

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
VALUES('/', 0, '{"points": 1000, "duration": 86400}');

INSERT INTO "rate_limit_rules" (route, tier, options)
VALUES('/', 1, '{"points": 120, "duration": 60}');

INSERT INTO "rate_limit_rules" (route, tier, options)
VALUES('/', 2, '{"points": 1000, "duration": 60}');

INSERT INTO "rate_limit_rules" (route, tier, options)
VALUES('/', 3, '{"points": 10000, "duration": 60}');

INSERT INTO "rate_limit_rules" (route, tier, options)
VALUES('/', 4, '{"points": 50000, "duration": 60}');

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "rate_limit_rules";`);
  }
}
