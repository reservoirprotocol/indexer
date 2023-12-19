import { Log } from "@ethersproject/abstract-provider";
import { TransactionResponse } from "@ethersproject/providers";

export type BaseEventParams = {
  address: string;
  block: number;
  blockHash: string;
  txHash: string;
  txIndex: number;
  logIndex: number;
  timestamp: number;
  batchIndex: number;
  from: string;
  to: string | undefined;
};

export const parseEvent = (
  log: Log,
  timestamp: number,
  batchIndex = 1,
  txData: TransactionResponse
): BaseEventParams => {
  const address = log.address.toLowerCase();
  const block = log.blockNumber;
  const blockHash = log.blockHash.toLowerCase();
  const txHash = log.transactionHash.toLowerCase();
  const txIndex = log.transactionIndex;
  const logIndex = log.logIndex;
  const from = txData?.from?.toLowerCase();
  const to = txData?.to?.toLowerCase();

  return {
    address,
    txHash,
    txIndex,
    block,
    blockHash,
    logIndex,
    timestamp,
    batchIndex,
    from,
    to,
  };
};
