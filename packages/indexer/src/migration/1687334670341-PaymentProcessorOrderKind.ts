import { MigrationInterface, QueryRunner } from "typeorm";
export class PaymentProcessorOrderKind1687334670341 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `

ALTER TYPE "order_kind_t" ADD VALUE 'payment-processor';

`
    );
  }

  async down(): Promise<void> {
    // Empty
  }
}
