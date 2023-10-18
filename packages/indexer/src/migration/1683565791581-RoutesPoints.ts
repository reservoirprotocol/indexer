import { MigrationInterface, QueryRunner } from "typeorm";
export class RoutesPoints1683565791581 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

CREATE TABLE "api_routes_points" (
  "route" TEXT NOT NULL,
  "points" INT NOT NULL
);

ALTER TABLE "api_routes_points"
  ADD CONSTRAINT "api_routes_points_pk"
  PRIMARY KEY ("route");

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "api_routes_points";`);
  }
}
