import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { GenericOrderInfo } from "@/jobs/orderbook/orders-queue";
import * as orders from "@/orderbook/orders";

export type OpenseaBidsQueueJobPayload = {
  orderInfo: GenericOrderInfo;
};

export class OpenseaBidsQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "orderbook-opensea-bids-queue";
  maxRetries = 10;
  concurrency = 20;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: OpenseaBidsQueueJobPayload) {
    const { kind, info, validateBidValue, ingestMethod, ingestDelay } = payload.orderInfo;

    let result: { status: string; delay?: number }[] = [];
    try {
      switch (kind) {
        case "x2y2": {
          result = await orders.x2y2.save([info]);
          break;
        }

        case "element": {
          result = await orders.element.save([info]);
          break;
        }

        case "foundation": {
          result = await orders.foundation.save([info]);
          break;
        }

        case "cryptopunks": {
          result = await orders.cryptopunks.save([info]);
          break;
        }

        case "zora-v3": {
          result = await orders.zora.save([info]);
          break;
        }

        case "seaport": {
          result = await orders.seaport.save([info], validateBidValue, ingestMethod);
          break;
        }

        case "seaport-v1.4": {
          result = await orders.seaportV14.save(
            [info],
            validateBidValue,
            ingestMethod,
            ingestDelay
          );
          break;
        }

        case "seaport-v1.5": {
          result = await orders.seaportV15.save(
            [info],
            validateBidValue,
            ingestMethod,
            ingestDelay
          );
          break;
        }

        case "sudoswap": {
          result = await orders.sudoswap.save([info]);
          break;
        }

        case "sudoswap-v2": {
          result = await orders.sudoswapV2.save([info]);
          break;
        }

        case "zeroex-v4": {
          result = await orders.zeroExV4.save([info]);
          break;
        }

        case "universe": {
          result = await orders.universe.save([info]);
          break;
        }

        case "rarible": {
          result = await orders.rarible.save([info]);
          break;
        }

        case "flow": {
          result = await orders.flow.save([info]);
          break;
        }

        case "blur": {
          result = await orders.blur.saveFullListings([info], ingestMethod);
          break;
        }

        case "blur-listing": {
          result = await orders.blur.savePartialListings([info], ingestMethod);
          break;
        }

        case "blur-bid": {
          result = await orders.blur.savePartialBids([info], ingestMethod);
          break;
        }

        case "manifold": {
          result = await orders.manifold.save([info]);
          break;
        }

        case "nftx": {
          result = await orders.nftx.save([info]);
          break;
        }

        case "superrare": {
          result = await orders.superrare.save([info]);
          break;
        }

        case "looks-rare-v2": {
          result = await orders.looksRareV2.save([info]);
          break;
        }

        case "collectionxyz": {
          result = await orders.collectionxyz.save([info]);
          break;
        }
      }
    } catch (error) {
      logger.error(this.queueName, `Failed to process order ${JSON.stringify(payload)}: ${error}`);
      throw error;
    }

    logger.debug(this.queueName, `[${kind}] Order save result: ${JSON.stringify(result)}`);
  }

  public async addToQueue(orderInfos: GenericOrderInfo[]) {
    await this.sendBatch(
      orderInfos.map((orderInfo) => ({
        payload: { orderInfo },
      }))
    );
  }
}

export const openseaBidsQueueJob = new OpenseaBidsQueueJob();
