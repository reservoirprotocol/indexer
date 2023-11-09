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

export default class HandleNewSellOrderJob extends AbstractRabbitMqJobHandler {
  queueName = "handle-new-sell-order-queue";
  maxRetries = 10;
  concurrency = 2;

  public async process(payload: HandleNewSellOrderJobPayload) {
    const { contract, tokenId, price, previousPrice } = payload;

    const tokenAttributes = await Tokens.getTokenAttributes(contract, tokenId);
    if (_.isEmpty(tokenAttributes)) {
      return;
    }

    const tokenAttributesIds = _.map(
      tokenAttributes,
      (tokenAttribute) => tokenAttribute.attributeId
    );

    // If this is a new sale
    if (_.isNull(previousPrice) && !_.isNull(price)) {
      await Attributes.incrementOnSaleCount(tokenAttributesIds, 1);
      await resyncAttributeCacheJob.addToQueue({
        contract,
        tokenId,
      });
    }

    // The sale ended
    if (!_.isNull(previousPrice) && _.isNull(price)) {
      await Attributes.incrementOnSaleCount(tokenAttributesIds, -1);
      await resyncAttributeCacheJob.addToQueue({
        contract,
        tokenId,
      });
    }

    // Check for new sell floor price
    if (!_.isNull(price)) {
      // Check for new sell floor price
      for (const tokenAttribute of tokenAttributes) {
        if (
          _.isNull(tokenAttribute.floorSellValue) ||
          Number(price) < Number(tokenAttribute.floorSellValue)
        ) {
          await Attributes.update(tokenAttribute.attributeId, {
            floorSellValue: price,
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
