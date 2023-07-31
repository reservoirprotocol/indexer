import { Log } from "@ethersproject/abstract-provider";

import { pgp, txdb } from "@/common/db";
import { toBuffer } from "@/common/utils";
export type TransactionLogs = {
  hash: string;
  logs: Log[];
};
export const saveTransactionLogs = async (transactionLogs: Log[]) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const values: any[] = [];
  const columns = new pgp.helpers.ColumnSet(
    [
      "hash",
      "address",
      "block_number",
      "block_hash",
      "transaction_index",
      "log_index",
      "data",
      "topics",
      "removed",
    ],
    {
      table: "transaction_logs",
    }
  );

  for (const log of transactionLogs) {
    values.push({
      hash: toBuffer(log.transactionHash),
      address: log.address,
      block_number: log.blockNumber,
      block_hash: log.blockHash,
      transaction_index: log.transactionIndex,
      log_index: log.logIndex,
      data: log.data,
      topics: log.topics,
      removed: log.removed,
    });
  }

  if (values.length === 0) {
    return;
  }

  await txdb.none(
    `
      INSERT INTO "transaction_logs" (
        hash,
        address,
        block_number,
        block_hash,
        transaction_index,
        log_index,
        data,
        topics,
        removed

      ) VALUES ${pgp.helpers.values(values, columns)}
      ON CONFLICT DO NOTHING  
    `
  );

  return transactionLogs;
};

export const getTransactionLogs = async (hash: string): Promise<TransactionLogs> => {
  const result = await txdb.oneOrNone(
    `
      SELECT
        *
      FROM transaction_logs
      WHERE transaction_logs.hash = $/hash/
      ORDER BY transaction_logs.log_index ASC
    `,
    { hash: toBuffer(hash) }
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const logs = result.logs.map((log: any) => ({
    address: log.address,
    blockNumber: log.block_number,
    blockHash: log.block_hash,
    transactionIndex: log.transaction_index,
    logIndex: log.log_index,
    data: log.data,
    topics: log.topics,
    removed: log.removed,
  }));

  return {
    hash,
    logs,
  };
};
