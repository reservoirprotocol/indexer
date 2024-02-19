import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { PendingAskEventsQueue } from "@/elasticsearch/indexes/asks/pending-ask-events-queue";
import { config } from "@/config/index";
import { AskCreatedEventHandler } from "@/elasticsearch/indexes/asks/event-handlers/ask-created";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { Collections } from "@/models/collections";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";

export enum EventKind {
  newSellOrder = "newSellOrder",
  sellOrderUpdated = "sellOrderUpdated",
  SellOrderInactive = "SellOrderInactive",
}

export type ProcessAskEventJobPayload = {
  kind: EventKind;
  data: OrderInfo;
  retries?: number;
};

export class ProcessAskEventJob extends AbstractRabbitMqJobHandler {
  queueName = "process-ask-event-queue";
  maxRetries = 10;
  concurrency = 15;
  persistent = true;

  public async process(payload: ProcessAskEventJobPayload) {
    const { kind, data } = payload;

    const pendingAskEventsQueue = new PendingAskEventsQueue();
    const askCreatedEventHandler = new AskCreatedEventHandler(data.id);

    if (kind === EventKind.SellOrderInactive) {
      if (!(await askCreatedEventHandler.isAskActive())) {
        const askDocumentId = askCreatedEventHandler.getAskId();
        await pendingAskEventsQueue.add([{ info: { id: askDocumentId }, kind: "delete" }]);
      }
    } else {
      const askDocumentInfo = await askCreatedEventHandler.generateAsk();

      if (askDocumentInfo) {
        await pendingAskEventsQueue.add([{ info: askDocumentInfo, kind: "index" }]);
      } else {
        const [, contract, tokenId] = data.token_set_id.split(":");

        const orderExists = await idb.oneOrNone(
          `SELECT 1 FROM orders WHERE id = $/orderId/ AND orders.side = 'sell' AND orders.fillability_status = 'fillable' AND orders.approval_status = 'approved' LIMIT 1;`,
          {
            orderId: data.id,
          }
        );

        if (orderExists) {
          logger.info(
            this.queueName,
            JSON.stringify({
              message: `generateAsk failed but active order exists - Refreshing Token. orderId=${data.id}, contract=${contract}, tokenId=${tokenId}`,
              topic: "debugMissingAsks",
              payload,
            })
          );

          const collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));

          await metadataIndexFetchJob.addToQueue([
            {
              kind: "single-token",
              data: {
                method: metadataIndexFetchJob.getIndexingMethod(collection),
                contract,
                tokenId,
                collection: collection?.id || contract,
              },
              context: this.queueName,
            },
          ]);
        } else {
          logger.warn(
            this.queueName,
            JSON.stringify({
              message: `generateAsk failed due to order missing. orderId=${data.id}, contract=${contract}, tokenId=${tokenId}`,
              topic: "debugMissingAsks",
              payload,
            })
          );
        }
      }
    }
  }

  public async addToQueue(payloads: ProcessAskEventJobPayload[], delay = 0) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.sendBatch(payloads.map((payload) => ({ payload, delay })));
  }
}

export const processAskEventJob = new ProcessAskEventJob();

interface OrderInfo {
  id: string;
  side: string;
  contract: string;
  currency: string;
  price: string;
  value: string;
  currency_price: string;
  currency_value: string;
  normalized_value: string;
  currency_normalized_value: string;
  source_id_int: number;
  quantity_filled: number;
  quantity_remaining: number;
  fee_bps: number;
  fillability_status: string;
  approval_status: string;
  created_at: string;
  kind: string;
  token_set_id: string;
}
