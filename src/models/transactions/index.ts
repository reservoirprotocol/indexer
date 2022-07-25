import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { fromBuffer, toBuffer } from "@/common/utils";

export type Transaction = {
  hash: string;
  from: string;
  to: string;
  value: string;
  data: string;
  blockNumber: number;
  blockTimestamp: number;
  gasPrice?: string;
  gasUsed?: string;
  gasFee?: string;
};

export const saveTransaction = async (transaction: Transaction) => {
  await idb.none(
    `
      INSERT INTO transactions (
        hash,
        "from",
        "to",
        value,
        data,
        block_number,
        block_timestamp,
        gas_price,
        gas_used,
        gas_fee
      ) VALUES (
        $/hash/,
        $/from/,
        $/to/,
        $/value/,
        $/data/,
        $/blockNumber/,
        $/blockTimestamp/,
        $/gasPrice/,
        $/gasUsed/,
        $/gasFee/
      )
      ON CONFLICT DO NOTHING
    `,
    {
      hash: toBuffer(transaction.hash),
      from: toBuffer(transaction.from),
      to: toBuffer(transaction.to),
      value: transaction.value,
      data: toBuffer(transaction.data),
      blockNumber: transaction.blockNumber,
      blockTimestamp: transaction.blockTimestamp,
      gasPrice: transaction.gasPrice,
      gasUsed: transaction.gasUsed,
      gasFee: transaction.gasFee,
    }
  );

  return transaction;
};

export const getTransaction = async (
  hash: string
): Promise<Pick<Transaction, "hash" | "from" | "to" | "value">> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        transactions.from,
        transactions.to,
        transactions.value
      FROM transactions
      WHERE transactions.hash = $/hash/
    `,
    { hash: toBuffer(hash) }
  );

  try {
    return {
      hash,
      from: fromBuffer(result.from),
      to: fromBuffer(result.to),
      value: result.value,
    };
  } catch (error) {
    logger.info("debug", `Error fetching transaction ${hash}: ${JSON.stringify(result)}`);
    throw error;
  }
};
