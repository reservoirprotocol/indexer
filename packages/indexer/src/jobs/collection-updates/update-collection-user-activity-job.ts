import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export type UpdateCollectionActivityJobPayload = {
  newCollectionId: string;
  oldCollectionId: string;
  contract: string;
  tokenId: string;
};

export class UpdateCollectionUserActivityJob extends AbstractRabbitMqJobHandler {
  queueName = "update-collection-user-activity-queue";
  maxRetries = 10;
  concurrency = 15;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: UpdateCollectionActivityJobPayload) {
    const { newCollectionId, oldCollectionId, contract, tokenId } = payload;
    const limit = 2000;

    // Update the user activities
    const query = `
        WITH x AS (
          SELECT id
          FROM user_activities
          WHERE contract = $/contract/
          AND token_id = $/tokenId/
          AND collection_id = $/oldCollectionId/
          LIMIT ${limit}
        )
        
        UPDATE user_activities
        SET collection_id = $/newCollectionId/
        FROM x
        WHERE user_activities.id = x.id
        RETURNING 1
      `;

    const result = await idb.manyOrNone(query, {
      newCollectionId,
      oldCollectionId,
      contract: toBuffer(contract),
      tokenId,
    });

    logger.info(
      this.queueName,
      `Updated ${result.length} user_activities from ${oldCollectionId} to ${newCollectionId}`
    );

    if (result.length > 0) {
      await this.addToQueue(payload);
    }
  }

  public async addToQueue(params: UpdateCollectionActivityJobPayload) {
    await this.send({ payload: params, jobId: `${params.contract}:${params.tokenId}` });
  }
}

export const updateCollectionUserActivityJob = new UpdateCollectionUserActivityJob();
