import { MigrationInterface, QueryRunner } from "typeorm";
export class AddCryptokittiesContractKind1669967716333 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "contract_kind_t" ADD VALUE 'cryptokitties';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
