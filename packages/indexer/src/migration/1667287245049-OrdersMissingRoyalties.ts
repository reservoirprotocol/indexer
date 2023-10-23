import { MigrationInterface, QueryRunner } from "typeorm";
export class OrdersMissingRoyalties1667287245049 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "orders" ADD COLUMN "missing_royalties" JSONB;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "missing_royalties" JSONB;`);
  }
}
