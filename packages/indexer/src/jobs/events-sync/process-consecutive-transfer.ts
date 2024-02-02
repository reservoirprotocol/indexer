import { Log } from "@ethersproject/abstract-provider";
import _ from "lodash";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { getNetworkSettings } from "@/config/network";
import { getEventData } from "@/events-sync/data";
import { initOnChainData, processOnChainData } from "@/events-sync/handlers/utils";
import { handleMints } from "@/events-sync/handlers/utils/erc721";
import { BaseEventParams } from "@/events-sync/parser";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { blockCheckJob } from "@/jobs/events-sync/block-check-queue-job";

export type ProcessConsecutiveTransferJobPayload = {
  fromAddress: string;
  toAddress: string;
  // Needed for properly setting the `batchIndex`
  globalFromTokenId: number;
  fromTokenId: number;
  toTokenId: number;
  baseEventParams: BaseEventParams;
};

export class ProcessConsecutiveTransferJob extends AbstractRabbitMqJobHandler {
  queueName = "process-consecutive-transfer";
  maxRetries = 10;
  concurrency = 1;

  private getJobsCounterKeyName(txHash: string, logIndex: number) {
    return `${this.queueName}:jobs:${txHash}:${logIndex}`;
  }

  private async setJobsCounter(txHash: string, logIndex: number, totalJobs: number) {
    await redis.set(this.getJobsCounterKeyName(txHash, logIndex), totalJobs);
  }

  private async countJob(txHash: string, logIndex: number) {
    return redis.decr(this.getJobsCounterKeyName(txHash, logIndex));
  }

  private async removeJobsCounter(txHash: string, logIndex: number) {
    return redis.del(this.getJobsCounterKeyName(txHash, logIndex));
  }

  public async process(payload: ProcessConsecutiveTransferJobPayload) {
    const { fromAddress, toAddress, globalFromTokenId, fromTokenId, toTokenId, baseEventParams } =
      payload;

    const onChainData = initOnChainData();
    const ns = getNetworkSettings();

    const mintedTokens = new Map<
      string,
      {
        contract: string;
        from: string;
        to: string;
        tokenId: string;
        amount: string;
        baseEventParams: BaseEventParams;
      }[]
    >();

    for (let i = fromTokenId; i <= toTokenId; i++) {
      const tokenId = i.toString();

      const updatedBaseEventParams = {
        ...baseEventParams,
        batchIndex: baseEventParams.batchIndex + (i - globalFromTokenId),
      };

      onChainData.nftTransferEvents.push({
        kind: "erc721",
        from: fromAddress,
        to: toAddress,
        tokenId,
        amount: "1",
        baseEventParams: updatedBaseEventParams,
      });

      if (ns.mintAddresses.includes(fromAddress)) {
        onChainData.mintInfos.push({
          contract: baseEventParams.address,
          tokenId,
          mintedTimestamp: baseEventParams.timestamp,
        });
        onChainData.mints.push({
          by: "tx",
          data: {
            txHash: baseEventParams.txHash,
          },
        });

        if (!ns.mintsAsSalesBlacklist.includes(baseEventParams.address)) {
          if (!mintedTokens.has(baseEventParams.txHash)) {
            mintedTokens.set(baseEventParams.txHash, []);
          }
          mintedTokens.get(baseEventParams.txHash)!.push({
            contract: baseEventParams.address,
            tokenId,
            from: fromAddress,
            to: toAddress,
            amount: "1",
            baseEventParams: updatedBaseEventParams,
          });
        }
      }
    }

    await handleMints(mintedTokens, onChainData);
    await processOnChainData(onChainData, false);

    logger.info(
      this.queueName,
      `Consecutive tokens processed contract ${baseEventParams.address} tokens ${fromTokenId} - ${toTokenId} for tx (${baseEventParams.txHash} log index ${baseEventParams.logIndex}`
    );

    // In the last job trigger a block check for an orphaned blocks
    if ((await this.countJob(baseEventParams.txHash, baseEventParams.logIndex)) === 0) {
      logger.info(
        this.queueName,
        `All jobs processed for tx (${baseEventParams.txHash} log index ${baseEventParams.logIndex}`
      );

      await blockCheckJob.addToQueue({
        block: baseEventParams.block,
        blockHash: baseEventParams.blockHash,
        delay: 60,
      });
      await this.removeJobsCounter(baseEventParams.txHash, baseEventParams.logIndex);
    }
  }

  public async addToQueue(log: Log, baseEventParams: BaseEventParams) {
    const tokensPerBatch = 100;
    const eventData = getEventData(["erc721-consecutive-transfer"])[0];
    const parsedLog = eventData.abi.parseLog(log);
    const fromAddress = parsedLog.args["fromAddress"].toLowerCase();
    const toAddress = parsedLog.args["toAddress"].toLowerCase();
    const fromTokenId = parsedLog.args["fromTokenId"].toString();
    const toTokenId = parsedLog.args["toTokenId"].toString();

    const fromNumber = Number(fromTokenId);
    const toNumber = Number(toTokenId);

    // Split the log processing to batches
    let jobsCounter = 0;

    const jobs = [];
    for (let from = fromNumber; from <= toNumber; from += tokensPerBatch + 1) {
      ++jobsCounter;

      jobs.push({
        payload: {
          fromAddress,
          toAddress,
          globalFromTokenId: fromNumber,
          fromTokenId: from,
          toTokenId: _.min([from + tokensPerBatch, toNumber]),
          baseEventParams,
        },
      });
    }

    await this.sendBatch(jobs);
    await this.setJobsCounter(baseEventParams.txHash, baseEventParams.logIndex, jobsCounter);
  }
}

export const processConsecutiveTransferJob = new ProcessConsecutiveTransferJob();
