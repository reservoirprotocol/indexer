import { MigrationInterface, QueryRunner } from "typeorm";
export class ContractsFilteredOperators1680055939007 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TABLE "contracts" ADD COLUMN "filtered_operators" JSONB;

`
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contracts" DROP COLUMN "filtered_operators";`);
  }
}
