import { CallTrace } from "@georgeroman/evm-tx-simulator/dist/types";

import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export type TransactionTrace = {
  hash: string;
  calls: CallTrace;
};

export const saveTransactionTrace = async (transactionTrace: TransactionTrace) => {
  await idb.none(
    `
      INSERT INTO transaction_traces (
        hash,
        calls
      ) VALUES (
        $/hash/,
        $/calls:json/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      hash: toBuffer(transactionTrace.hash),
      calls: transactionTrace.calls,
    }
  );

  return transactionTrace;
};

export const getTransactionTrace = async (hash: string): Promise<TransactionTrace> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        transaction_traces.hash,
        transaction_traces.calls
      FROM transaction_traces
      WHERE transaction_traces.hash = $/hash/
    `,
    { hash: toBuffer(hash) }
  );

  return {
    hash,
    calls: result.calls,
  };
};
