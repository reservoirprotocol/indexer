import { Log } from "@ethersproject/abstract-provider";

import { pgp, txdb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { logger } from "@/common/logger";
export type TransactionLogs = {
  hash: string;
  logs: Log[];
};
export const saveTransactionLogs = async (transactionLogs: Log[]) => {
  try {
    if (!transactionLogs || transactionLogs.length === 0) {
      return;
    }
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
        {
          name: "topics",
          cast: "bytea[]",
        },
        "removed",
      ],
      {
        table: "transaction_logs",
      }
    );

    for (const log of transactionLogs) {
      values.push({
        hash: toBuffer(log.transactionHash),
        address: toBuffer(log.address),
        block_number: log.blockNumber,
        block_hash: toBuffer(log.blockHash),
        transaction_index: log.transactionIndex,
        log_index: log.logIndex,
        data: toBuffer(log.data),
        topics: log.topics,
        removed: log.removed ? true : false,
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
  } catch (error) {
    logger.error("save-transaction-logs", `Error saving transaction logs: ${error}`);
  }
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

export const deleteTransactionLogs = async (blockHash: string) => {
  // set removed = true for all logs in block with blockHash
  await txdb.none(
    `
      UPDATE transaction_logs
      SET removed = true
      WHERE transaction_logs.block_hash = $/blockHash/
    `,
    { blockHash: toBuffer(blockHash) }
  );
};
