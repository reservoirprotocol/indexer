import { MigrationInterface, QueryRunner } from "typeorm";
export class Remove1671463565183 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

DROP TABLE "opensea_websocket_events";

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
