import { CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";

import { txdb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type TransactionTrace = {
  hash: string;
  calls: CallTrace;
};

export const saveTransactionTraces = async (transactionTraces: TransactionTrace[]) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any[] = [];
  const columns = new pgp.helpers.ColumnSet(["hash", { name: "calls", mod: ":json" }], {
    table: "transaction_traces",
  });

  for (const { hash, calls } of transactionTraces) {
    if (!calls) {
      continue;
    }
    values.push({
      hash: toBuffer(hash),
      calls,
    });
  }

  if (values.length === 0) {
    return;
  }

  await txdb.none(
    `
      INSERT INTO "transaction_traces" (
        hash,
        calls
      ) VALUES ${pgp.helpers.values(values, columns)}
      ON CONFLICT DO NOTHING
    `
  );

  return transactionTraces;
};

export const getTransactionTraces = async (hashes: string[]): Promise<TransactionTrace[]> => {
  if (!hashes.length) {
    return [];
  }

  const result = await txdb.manyOrNone(
    `
      SELECT
        transaction_traces.hash,
        transaction_traces.calls
      FROM transaction_traces
      WHERE transaction_traces.hash IN ($/hashes:list/)
    `,
    { hashes: hashes.map(toBuffer) }
  );

  return result.map((r) => ({
    hash: fromBuffer(r.hash),
    calls: r.calls,
  }));
};

export const deleteTransactionTraces = async (blockHash: string) => {
  // get transactions with block hash
  const transactions = await txdb.manyOrNone(
    `
      SELECT
        transactions.hash
      FROM transactions
      WHERE transactions.block_hash = $/blockHash/
    `,
    { blockHash: toBuffer(blockHash) }
  );

  // delete transaction traces with transaction hash
  await txdb.none(
    `
      DELETE FROM transaction_traces
      WHERE transaction_traces.hash IN ($/hashes:list/)
    `,

    { hashes: transactions.map((t) => t.hash) }
  );
};
