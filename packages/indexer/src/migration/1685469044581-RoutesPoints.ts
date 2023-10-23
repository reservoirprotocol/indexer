import { MigrationInterface, QueryRunner } from "typeorm";
export class RoutesPoints1685469044581 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

DROP TABLE "api_routes_points";

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
