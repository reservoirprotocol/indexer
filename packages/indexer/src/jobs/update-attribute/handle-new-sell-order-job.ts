import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Attributes } from "@/models/attributes";
import { Tokens } from "@/models/tokens";
import _ from "lodash";
import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";

export type HandleNewSellOrderJobPayload = {
  contract: string;
  tokenId: string;
  price: number | null;
  previousPrice: number | null;
};

export class HandleNewSellOrderJob extends AbstractRabbitMqJobHandler {
  queueName = "handle-new-buy-order-queue";
  maxRetries = 10;
  concurrency = 6;

  protected async process(payload: HandleNewSellOrderJobPayload) {
    const tokenAttributes = await Tokens.getTokenAttributes(payload.contract, payload.tokenId);
    if (_.isEmpty(tokenAttributes)) {
      return;
    }

    const tokenAttributesIds = _.map(
      tokenAttributes,
      (tokenAttribute) => tokenAttribute.attributeId
    );

    // If this is a new sale
    if (_.isNull(payload.previousPrice) && !_.isNull(payload.price)) {
      await Attributes.incrementOnSaleCount(tokenAttributesIds, 1);
      await resyncAttributeCacheJob.addToQueue({
        contract: payload.contract,
        tokenId: payload.tokenId,
      });
    }

    // The sale ended
    if (!_.isNull(payload.previousPrice) && _.isNull(payload.price)) {
      await Attributes.incrementOnSaleCount(tokenAttributesIds, -1);
      await resyncAttributeCacheJob.addToQueue({
        contract: payload.contract,
        tokenId: payload.tokenId,
      });
    }

    // Check for new sell floor price
    if (!_.isNull(payload.price)) {
      // Check for new sell floor price
      for (const tokenAttribute of tokenAttributes) {
        if (
          _.isNull(tokenAttribute.floorSellValue) ||
          Number(payload.price) < Number(tokenAttribute.floorSellValue)
        ) {
          await Attributes.update(tokenAttribute.attributeId, {
            floorSellValue: payload.price,
            sellUpdatedAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  public async addToQueue(params: HandleNewSellOrderJobPayload) {
    await this.send({ payload: params });
  }
}

export const handleNewSellOrderJob = new HandleNewSellOrderJob();
