/* eslint-disable @typescript-eslint/naming-convention */
import { MigrationBuilder, ColumnDefinitions } from 'node-pg-migrate';

export const shorthands: ColumnDefinitions | undefined = undefined;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createIndex("orders", ["side", "created_at", "hash"], {
    name: 'orders_side_created_at_hash',
    where: `"status" = 'valid'`,
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex('orders',["side", "created_at", "hash"], {
    name: 'orders_side_created_at_hash'
  })
}
