import _ from "lodash";
import { idb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";

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

/**
 * Store single transaction and return it
 * @param transaction
 * @return Transaction
 */
export const saveTransaction = async (transaction: Transaction) => {
  if (config.chainId === 137 && transaction.from === transaction.to) {
    return transaction;
  }

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

/**
 * Store batch transactions and return nothing
 * @param transactions
 */
export const saveTransactions = async (transactions: Transaction[]) => {
  if (config.chainId === 137) {
    transactions = transactions.filter((t) => t.from !== t.to);
  }

  if (_.isEmpty(transactions)) {
    return;
  }

  const columns = new pgp.helpers.ColumnSet(
    [
      "hash",
      "from",
      "to",
      "value",
      "data",
      "block_number",
      "block_timestamp",
      "gas_price",
      "gas_used",
      "gas_fee",
    ],
    { table: "transactions" }
  );

  const transactionsValues = _.map(transactions, (transaction) => ({
    hash: toBuffer(transaction.hash),
    from: toBuffer(transaction.from),
    to: toBuffer(transaction.to),
    value: transaction.value,
    data: toBuffer(transaction.data),
    block_number: transaction.blockNumber,
    block_timestamp: transaction.blockTimestamp,
    gas_price: transaction.gasPrice,
    gas_used: transaction.gasUsed,
    gas_fee: transaction.gasFee,
  }));

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
      ) VALUES ${pgp.helpers.values(transactionsValues, columns)}
      ON CONFLICT DO NOTHING
    `
  );
};

/**
 * Store batch transactions and return nothing (fast version)
 * @param transactions
 */
export const saveTransactionsV2 = async (transactions: Transaction[]) => {
  const CHUNK_SIZE = 10;

  // filter out transactions with same from and to
  transactions = transactions.filter((t) => t.from !== t.to);
  transactions = transactions.filter((t) => !t.data.startsWith("0x64617461"));
  if (_.isEmpty(transactions)) {
    return;
  }

  const columns = new pgp.helpers.ColumnSet(
    [
      "hash",
      "from",
      "to",
      "value",
      "data",
      "block_number",
      "block_timestamp",
      "gas_price",
      "gas_used",
      "gas_fee",
    ],
    { table: "transactions" }
  );

  const transactionsValues = _.map(transactions, (transaction) => ({
    hash: toBuffer(transaction.hash),
    from: toBuffer(transaction.from),
    to: toBuffer(transaction.to),
    value: transaction.value,
    data: toBuffer(transaction.data),
    block_number: transaction.blockNumber,
    block_timestamp: transaction.blockTimestamp,
    gas_price: transaction.gasPrice,
    gas_used: transaction.gasUsed,
    gas_fee: transaction.gasFee,
  }));

  const chunks = _.chunk(transactionsValues, CHUNK_SIZE);

  await Promise.all(
    chunks.map((chunk) =>
      idb.none(
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
        ) VALUES ${pgp.helpers.values(chunk, columns)}
        ON CONFLICT DO NOTHING
      `
      )
    )
  );
};

export const getTransaction = async (hash: string): Promise<Transaction | undefined> => {
  const result = await idb.oneOrNone(
    `
      SELECT
        transactions.from,
        transactions.to,
        transactions.value,
        transactions.data,
        transactions.block_number,
        transactions.block_timestamp
      FROM transactions
      WHERE transactions.hash = $/hash/
    `,
    { hash: toBuffer(hash) }
  );
  if (!result) {
    return undefined;
  }

  return {
    hash,
    from: fromBuffer(result.from),
    to: fromBuffer(result.to),
    value: result.value,
    data: fromBuffer(result.data),
    blockNumber: result.block_number,
    blockTimestamp: result.block_timestamp,
  };
};
