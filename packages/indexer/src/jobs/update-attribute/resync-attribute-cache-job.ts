import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Attributes } from "@/models/attributes";
import { Tokens } from "@/models/tokens";

export type ResyncAttributeCacheJobPayload = {
  contract: string;
  tokenId: string;
};

export default class ResyncAttributeCacheJob extends AbstractRabbitMqJobHandler {
  queueName = "resync-attribute-cache-queue";
  maxRetries = 10;
  concurrency = 3;
  lazyMode = true;

  public async process(payload: ResyncAttributeCacheJobPayload) {
    const { contract, tokenId } = payload;

    const tokenAttributes = await Tokens.getTokenAttributes(contract, tokenId, 10000);

    // Recalculate the number of tokens on sale for each attribute
    for (const tokenAttribute of tokenAttributes) {
      const { floorSellValue, onSaleCount } = await Tokens.getSellFloorValueAndOnSaleCount(
        tokenAttribute.collectionId,
        tokenAttribute.key,
        tokenAttribute.value
      );

      await Attributes.update(tokenAttribute.attributeId, {
        floorSellValue,
        onSaleCount,
        sellUpdatedAt: new Date().toISOString(),
      });
    }
  }

  public async addToQueue(
    params: ResyncAttributeCacheJobPayload,
    delay = 60 * 60 * 24 * 1000,
    forceRefresh = false
  ) {
    const token = `${params.contract}:${params.tokenId}`;
    const jobId = forceRefresh ? undefined : token;
    await this.send({ payload: params, jobId }, delay);
  }
}

export const resyncAttributeCacheJob = new ResyncAttributeCacheJob();
