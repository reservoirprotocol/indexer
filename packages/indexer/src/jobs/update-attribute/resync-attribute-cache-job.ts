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

  public async process(payload: ResyncAttributeCacheJobPayload) {
    const { contract, tokenId } = payload;

    const tokenAttributes = await Tokens.getTokenAttributes(contract, tokenId, 15000);

    // Recalculate the number of tokens on sale for each attribute
    for (const tokenAttribute of tokenAttributes) {
      const { floorSell, onSaleCount } = await Tokens.getSellFloorValueAndOnSaleCount(
        tokenAttribute.collectionId,
        tokenAttribute.key,
        tokenAttribute.value
      );

      await Attributes.update(tokenAttribute.attributeId, {
        floorSellId: floorSell?.id,
        floorSellValue: floorSell?.value,
        floorSellCurrency: floorSell?.currency,
        floorSellCurrencyValue: floorSell?.currencyValue,
        floorSellMaker: floorSell?.maker,
        floorSellValidFrom: floorSell?.validFrom,
        floorSellValidTo: floorSell?.validTo,
        floorSellSourceIdInt: floorSell?.sourceIdInt,
        onSaleCount,
        sellUpdatedAt: new Date().toISOString(),
      });
    }
  }

  public async addToQueue(
    params: ResyncAttributeCacheJobPayload,
    delay = 60 * 10 * 1000,
    forceRefresh = false
  ) {
    const token = `${params.contract}:${params.tokenId}`;
    const jobId = forceRefresh ? undefined : token;
    await this.send({ payload: params, jobId }, delay);
  }
}

export const resyncAttributeCacheJob = new ResyncAttributeCacheJob();
