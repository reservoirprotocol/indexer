import { idb } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { fromBuffer, regex, toBuffer } from "@/common/utils";
import _ from "lodash";
import { Collections } from "@/models/collections";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { RabbitMQMessage } from "@/common/rabbit-mq";

export type UpdateNftBalancesSpamJobPayload = {
  collectionId: string;
  newSpamState: number;
  owner?: string;
};

export default class UpdateNftBalancesSpamJob extends AbstractRabbitMqJobHandler {
  queueName = "update-nft-balances-spam";
  maxRetries = 15;
  concurrency = _.includes([137], config.chainId) ? 3 : 5;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 5000,
  } as BackoffStrategy;

  protected async process(payload: UpdateNftBalancesSpamJobPayload) {
    const { collectionId, newSpamState, owner } = payload;
    const limit = 1000;
    let continuationFilter = "";
    let results;

    // Try to get the collection from the token record
    const collection = await Collections.getById(collectionId);

    // If no collection found throw an error to trigger a retry
    if (!collection) {
      logger.warn(this.queueName, `${collectionId} not found`);
      return;
    }

    if (collection.isSpam !== newSpamState) {
      logger.warn(
        this.queueName,
        `spam status change while updating ${collectionId} to ${newSpamState} current status ${collection.isSpam}`
      );
      return;
    }

    if (owner) {
      continuationFilter = `AND owner > $/owner/`;
    }

    if (collectionId.match(regex.address)) {
      // If a non shared contract
      const query = `
        UPDATE nft_balances SET
          is_spam = $/newSpamState/
        FROM (
          SELECT contract, owner, token_id
          FROM nft_balances
          WHERE contract = $/contract/
          AND is_spam IS DISTINCT FROM $/newSpamState/
          AND amount > 0
          ${continuationFilter}
          ORDER BY owner
          LIMIT $/limit/
        ) x
        WHERE nft_balances.contract = x.contract
        AND nft_balances.owner = x.owner
        AND nft_balances.token_id = x.token_id
        AND amount > 0
        RETURNING nft_balances.owner
      `;

      results = await idb.manyOrNone(query, {
        owner: owner ? toBuffer(owner) : "",
        contract: toBuffer(collection.contract),
        newSpamState,
        limit,
      });
    } else if (collectionId.match(/^0x[a-fA-F0-9]{40}:\d+:\d+$/)) {
      // If a token range collection
      const query = `
        UPDATE nft_balances SET
          is_spam = $/newSpamState/
        FROM (
          SELECT contract, owner, token_id
          FROM nft_balances
          WHERE contract = $/contract/
          AND is_spam IS DISTINCT FROM $/newSpamState/
          AND amount > 0
          AND token_id <@ $/tokenIdRange:raw/
          ${continuationFilter}
          ORDER BY owner
          LIMIT $/limit/
        ) x
        WHERE nft_balances.contract = x.contract
        AND nft_balances.owner = x.owner
        AND nft_balances.token_id = x.token_id
        AND amount > 0
        RETURNING nft_balances.owner
      `;

      results = await idb.manyOrNone(query, {
        owner: owner ? toBuffer(owner) : "",
        contract: toBuffer(collection.contract),
        newSpamState,
        limit,
        tokenIdRange: `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`,
      });
    } else {
      // If a token list collection
      const query = `
        UPDATE nft_balances SET
          is_spam = $/newSpamState/
        FROM (
          SELECT contract, owner, token_id
          FROM nft_balances
          WHERE contract = $/contract/
          AND is_spam IS DISTINCT FROM $/newSpamState/
          AND amount > 0
          AND token_id IN (SELECT token_id FROM tokens WHERE collection_id = $/collection/)
          ${continuationFilter}
          ORDER BY owner
          LIMIT $/limit/
        ) x
        WHERE nft_balances.contract = x.contract
        AND nft_balances.owner = x.owner
        AND nft_balances.token_id = x.token_id
        AND amount > 0
        RETURNING nft_balances.owner
      `;

      results = await idb.manyOrNone(query, {
        owner: owner ? toBuffer(owner) : "",
        contract: toBuffer(collection.contract),
        newSpamState,
        limit,
        collection: collectionId,
      });
    }

    if (results.length == limit) {
      const lastItem = _.last(results);

      return {
        addToQueue: true,
        payload: { collectionId, newSpamState, owner: fromBuffer(lastItem.owner) },
      };
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      payload?: UpdateNftBalancesSpamJobPayload;
    }
  ) {
    if (processResult.addToQueue && processResult.payload) {
      await this.addToQueue(processResult.payload);
    }
  }

  public async addToQueue(payload: UpdateNftBalancesSpamJobPayload) {
    await this.send({ payload, jobId: `${payload.collectionId}:${payload.newSpamState}` });
  }
}

export const updateNftBalancesSpamJob = new UpdateNftBalancesSpamJob();
