import { CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";

import { idb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";

export type TransactionTrace = {
  hash: string;
  calls: CallTrace;
  result?: CallTrace;
};

export const saveTransactionTraces = async (transactionTraces: TransactionTrace[]) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any[] = [];
  const columns = new pgp.helpers.ColumnSet(["hash", { name: "calls", mod: ":json" }], {
    table: "transaction_traces",
  });

  for (const { hash, calls } of transactionTraces) {
    values.push({
      hash: toBuffer(hash),
      calls,
    });
  }

  await idb.none(
    `
      INSERT INTO transaction_traces (
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

  const result = await idb.manyOrNone(
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
