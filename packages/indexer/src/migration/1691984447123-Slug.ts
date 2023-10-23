import { MigrationInterface, QueryRunner } from "typeorm";
export class Slug1691984447123 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "collections" ALTER COLUMN "slug" DROP NOT NULL;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "collections" ALTER COLUMN "slug" SET NOT NULL;`);
  }
}
