import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { logger } from "@/common/logger";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";

export type UpdateCollectionActivityJobPayload = {
  newCollectionId: string;
  oldCollectionId: string;
  contract: string;
  tokenId: string;
  continueUpdate?: boolean;
};

export class UpdateCollectionUserActivityJob extends AbstractRabbitMqJobHandler {
  queueName = "update-collection-user-activity-queue";
  maxRetries = 10;
  concurrency = 15;
  backoff = {
    type: "fixed",
    delay: 5000,
  } as BackoffStrategy;

  protected async process(payload: UpdateCollectionActivityJobPayload) {
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
      newCollectionId: payload.newCollectionId,
      oldCollectionId: payload.oldCollectionId,
      contract: toBuffer(payload.contract),
      tokenId: payload.tokenId,
    });

    logger.info(
      this.queueName,
      `Updated ${result.length} user_activities from ${payload.oldCollectionId} to ${payload.newCollectionId}`
    );

    payload.continueUpdate = result.length > 0;
  }

  public async addToQueue(params: UpdateCollectionActivityJobPayload) {
    await this.send({ payload: params, jobId: `${params.contract}:${params.tokenId}` });
  }
}

export const updateCollectionUserActivityJob = new UpdateCollectionUserActivityJob();

updateCollectionUserActivityJob.on("onCompleted", async (message) => {
  if (message.payload.continueUpdate) {
    await updateCollectionUserActivityJob.addToQueue(message.payload);
  }
});
