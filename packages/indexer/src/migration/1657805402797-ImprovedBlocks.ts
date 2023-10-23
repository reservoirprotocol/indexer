import { MigrationInterface, QueryRunner } from "typeorm";
export class ImprovedBlocks1657805402797 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "blocks" ADD COLUMN "timestamp" INT;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "blocks" DROP COLUMN "timestamp";`);
  }
}
