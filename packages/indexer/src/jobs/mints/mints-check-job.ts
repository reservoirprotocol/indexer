import { idb } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { getCollectionMints } from "@/orderbook/mints";
import { getStatus } from "@/orderbook/mints/calldata/helpers";

export type MintsCheckJobPayload = {
  collection: string;
};

export class MintsCheckJob extends AbstractRabbitMqJobHandler {
  queueName = "mints-check";
  maxRetries = 1;
  concurrency = 10;
  backoff = {
    type: "exponential",
    delay: 10000,
  } as BackoffStrategy;

  public async process(payload: MintsCheckJobPayload) {
    const { collection } = payload;

    const collectionMints = await getCollectionMints(collection, { status: "open" });
    for (const collectionMint of collectionMints) {
      const { status } = await getStatus(collectionMint);
      if (status === "closed") {
        await idb.none(
          `
            UPDATE collection_mints SET
              status = 'closed',
              updated_at = now()
            WHERE collection_mints.collection_id = $/collection/
              AND collection_mints.stage = $/stage/
              AND collection_mints.token_id = $/tokenId/
          `,
          {
            collection: collectionMint.collection,
            stage: collectionMint.stage,
            tokenId: collectionMint.tokenId ?? null,
          }
        );
      }
    }
  }

  public async addToQueue(mintInfo: MintsCheckJobPayload, delay = 0) {
    await this.send({ payload: mintInfo, jobId: mintInfo.collection }, delay * 1000);
  }
}

export const mintsCheckJob = new MintsCheckJob();
