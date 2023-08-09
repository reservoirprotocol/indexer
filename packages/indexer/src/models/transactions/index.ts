import _ from "lodash";
import { txdb, pgp } from "@/common/db";
import { fromBuffer, toBuffer } from "@/common/utils";
import { logger } from "@/common/logger";

export type Transaction = {
  hash: string;
  from: string;
  to: string;
  value: string;
  data: string;
  blockNumber: number;
  blockHash: string;
  blockTimestamp: number;
  gasPrice?: string;
  gasUsed?: string;
  gasFee?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  cumulativeGasUsed?: string;
  contractAddress?: string;
  logsBloom?: string;
  status?: boolean;
  transactionIndex?: number;
};

export const saveTransactions = async (transactions: Transaction[]) => {
  const CHUNK_SIZE = 10;

  // eslint-disable-next-line
  // console.log(JSON.stringify(transactions));

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
      "block_hash",
      "block_timestamp",
      "gas_price",
      "gas_used",
      "gas_fee",
      "max_fee_per_gas",
      "max_priority_fee_per_gas",
      "cumulative_gas_used",
      "contract_address",
      "logs_bloom",
      "status",
      "transaction_index",
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
    block_hash: toBuffer(transaction.blockHash),
    block_timestamp: transaction.blockTimestamp,
    gas_price: transaction.gasPrice,
    gas_used: transaction.gasUsed,
    gas_fee: transaction.gasFee,
    max_fee_per_gas: transaction.maxFeePerGas,
    max_priority_fee_per_gas: transaction.maxPriorityFeePerGas,
    cumulative_gas_used: transaction.cumulativeGasUsed,
    contract_address: transaction?.contractAddress ? toBuffer(transaction.contractAddress) : null,
    logs_bloom: transaction?.logsBloom ? toBuffer(transaction.logsBloom) : null,
    status: transaction.status,
    transaction_index: transaction.transactionIndex,
  }));

  const chunks = _.chunk(transactionsValues, CHUNK_SIZE);

  await Promise.all(
    chunks.map(async (chunk) => {
      try {
        await txdb.none(
          `
        INSERT INTO transactions (
          hash,
          "from",
          "to",
          value,
          data,
          block_number,
          block_hash,
          block_timestamp,
          gas_price,
          gas_used,
          gas_fee,
          max_fee_per_gas,
          max_priority_fee_per_gas,
          cumulative_gas_used,
          contract_address,
          logs_bloom,
          status,
          transaction_index
        ) VALUES ${pgp.helpers.values(chunk, columns)}
        ON CONFLICT DO NOTHING
      `
        );
      } catch (error) {
        logger.error("sync-events", `Error saving transactions: ${error}`);
      }
    })
  );
};

export const getTransaction = async (hash: string): Promise<Transaction> => {
  const result = await txdb.oneOrNone(
    `
      SELECT
        transactions.from,
        transactions.to,
        transactions.value,
        transactions.data,
        transactions.block_number,
        transactions.block_hash,
        transactions.block_timestamp,
        transactions.gas_price,
        transactions.gas_used,
        transactions.gas_fee,
        transactions.max_fee_per_gas,
        transactions.max_priority_fee_per_gas,
        transactions.cumulative_gas_used,
        transactions.contract_address,
        transactions.logs_bloom,
        transactions.status,
        transactions.transaction_index
      FROM transactions
      WHERE transactions.hash = $/hash/
    `,
    { hash: toBuffer(hash) }
  );

  return {
    hash,
    from: fromBuffer(result.from),
    to: fromBuffer(result.to),
    value: result.value,
    data: fromBuffer(result.data),
    blockNumber: result.block_number,
    blockHash: result.block_hash,
    blockTimestamp: result.block_timestamp,
    gasPrice: result.gas_price,
    gasUsed: result.gas_used,
    gasFee: result.gas_fee,
    maxFeePerGas: result.max_fee_per_gas,
    maxPriorityFeePerGas: result.max_priority_fee_per_gas,
    cumulativeGasUsed: result.cumulative_gas_used,
    status: result.status,
    transactionIndex: result.transaction_index,
  };
};

export const deleteBlockTransactions = async (blockHash: string) => {
  await txdb.none(
    `
      DELETE FROM transactions
      WHERE transactions.block_hash = $/blockHash/
    `,
    { blockHash: toBuffer(blockHash) }
  );
};
