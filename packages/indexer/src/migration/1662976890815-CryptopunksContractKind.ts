import { MigrationInterface, QueryRunner } from "typeorm";
export class CryptopunksContractKind1662976890815 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "contract_kind_t" ADD VALUE 'cryptopunks';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
