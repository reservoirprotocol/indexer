import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { Collections } from "@/models/collections";
import _ from "lodash";
import { AttributeKeys } from "@/models/attribute-keys";
import { Rarity } from "@/utils/rarity";

export type RarityQueueJobPayload = {
  collectionId: string;
};

export default class RarityQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "rarity-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = false;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  protected async process(payload: RarityQueueJobPayload) {
    const { collectionId } = payload;
    const collection = await Collections.getById(collectionId, true);
    const whitelistedLargeContracts: string[] = [];

    // If no collection found
    if (_.isNull(collection)) {
      logger.error(this.queueName, `Collection ${collectionId} not fund`);
      return;
    }

    // If the collection is too big
    if (
      _.indexOf(whitelistedLargeContracts, collectionId) === -1 &&
      collection.tokenCount > 100000
    ) {
      logger.warn(
        this.queueName,
        `Collection ${collectionId} has too many tokens (${collection.tokenCount})`
      );
      return;
    }

    const keysCount = await AttributeKeys.getKeysCount(collectionId);
    if (keysCount > 100) {
      logger.warn(this.queueName, `Collection ${collectionId} has too many keys (${keysCount})`);
      return;
    }

    const tokensRarity = await Rarity.getCollectionTokensRarity(collectionId);
    const tokensRarityChunks = _.chunk(tokensRarity, 500);

    // Update the tokens rarity
    for (const tokens of tokensRarityChunks) {
      let updateTokensString = "";
      const replacementParams = {
        contract: toBuffer(collection.contract),
      };

      _.forEach(tokens, (token) => {
        updateTokensString += `(${token.id}, ${token.rarityTraitSum}, ${token.rarityTraitSumRank}),`;
      });

      updateTokensString = _.trimEnd(updateTokensString, ",");

      if (updateTokensString !== "") {
        const updateQuery = `UPDATE tokens
                               SET 
                                rarity_score = x.rarityTraitSum,
                                rarity_rank = x.rarityTraitSumRank,
                                updated_at = now()
                               FROM (VALUES ${updateTokensString}) AS x(tokenId, rarityTraitSum, rarityTraitSumRank)
                               WHERE contract = $/contract/
                               AND token_id = x.tokenId
                               AND (rarity_score IS NULL OR rarity_rank IS NULL OR rarity_score <> x.rarityTraitSum OR rarity_rank <> x.rarityTraitSumRank)
                               `;

        await idb.none(updateQuery, replacementParams);
      }
    }
  }

  public async addToQueue(params: { collectionId: string | string[] }, delay = 60 * 60 * 1000) {
    if (_.isArray(params.collectionId)) {
      await this.sendBatch(
        params.collectionId.map((id) => ({ payload: { collectionId: id }, jobId: id, delay }))
      );
    } else {
      await this.send(
        { payload: { collectionId: params.collectionId }, jobId: params.collectionId },
        delay
      );
    }
  }
}

export const rarityQueueJob = new RarityQueueJob();
