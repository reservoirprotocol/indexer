import { idb } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { fromBuffer, toBuffer } from "@/common/utils";
import _ from "lodash";
import { Collections } from "@/models/collections";
import { config } from "@/config/index";
import { logger } from "@/common/logger";
import { RabbitMQMessage } from "@/common/rabbit-mq";

export type UpdateUserCollectionsSpamJobPayload = {
  collectionId: string;
  newSpamState: number;
  owner?: string;
};

export default class UpdateUserCollectionsSpamJob extends AbstractRabbitMqJobHandler {
  queueName = "update-user-collections-spam";
  maxRetries = 15;
  concurrency = _.includes([137], config.chainId) ? 3 : 5;
  backoff = {
    type: "exponential",
    delay: 5000,
  } as BackoffStrategy;

  public async process(payload: UpdateUserCollectionsSpamJobPayload) {
    const { collectionId, newSpamState, owner } = payload;
    const limit = 1000;
    let continuationFilter = "";

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

    const results = await idb.manyOrNone(
      `
          UPDATE user_collections SET
            is_spam = $/newSpamState/
          FROM (
            SELECT collection_id, owner
            FROM user_collections
            WHERE collection_id = $/collectionId/
            AND is_spam IS DISTINCT FROM $/newSpamState/
            ${continuationFilter}
            ORDER BY owner
            LIMIT $/limit/
          ) x
          WHERE user_collections.collection_id = x.collection_id
          AND user_collections.owner = x.owner
          RETURNING user_collections.owner
      `,
      {
        collectionId,
        owner: owner ? toBuffer(owner) : "",
        newSpamState,
        limit,
      }
    );

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
      payload?: UpdateUserCollectionsSpamJobPayload;
    }
  ) {
    if (processResult.addToQueue && processResult.payload) {
      await this.addToQueue(processResult.payload);
    }
  }

  public async addToQueue(payload: UpdateUserCollectionsSpamJobPayload) {
    await this.send({ payload, jobId: `${payload.collectionId}:${payload.newSpamState}` });
  }
}

export const updateUserCollectionsSpamJob = new UpdateUserCollectionsSpamJob();
