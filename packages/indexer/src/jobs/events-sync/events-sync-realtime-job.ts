import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";

import { logger } from "@/common/logger";
import { syncEvents, checkForOrphanedBlock, checkForMissingBlocks } from "@/events-sync/index";
import { baseProvider } from "@/common/provider";
import { blockNumberToHex } from "@/events-sync/utils";

export let supports_eth_getBlockReceipts = false;
export let supports_eth_getBlockTrace = false;

const checkSupports = async () => {
  // get latest block
  const latestBlock = await baseProvider.getBlockNumber();

  // try to call eth_getBlockReceipts
  try {
    await baseProvider.send("eth_getBlockReceipts", [blockNumberToHex(latestBlock)]);
    supports_eth_getBlockReceipts = true;
  } catch (error) {
    supports_eth_getBlockReceipts = false;
  }

  // try to call eth_getBlockTrace
  try {
    await baseProvider.send("debug_traceBlockByNumber", [
      blockNumberToHex(latestBlock),
      { tracer: "callTracer" },
    ]);
    supports_eth_getBlockTrace = true;
  } catch (error) {
    supports_eth_getBlockTrace = false;
  }
};

export type EventsSyncRealtimeJobPayload = {
  block: number;
};

export class EventsSyncRealtimeJob extends AbstractRabbitMqJobHandler {
  queueName = "events-sync-realtime";
  maxRetries = 30;
  concurrency = 5;
  useSharedChannel = true;
  backoff = {
    type: "fixed",
    delay: 100,
  } as BackoffStrategy;

  consrtuctor() {
    checkSupports();
  }

  protected async process(payload: EventsSyncRealtimeJobPayload) {
    try {
      const { block } = payload;

      await checkForMissingBlocks(block);
      await syncEvents(block);
      await checkForOrphanedBlock(block);
    } catch (error) {
      logger.warn(this.queueName, `Events realtime syncing failed: ${error}`);
      throw error;
    }
  }

  public async addToQueue(params: EventsSyncRealtimeJobPayload) {
    await this.send({ payload: params });
  }
}

export const eventsSyncRealtimeJob = new EventsSyncRealtimeJob();
