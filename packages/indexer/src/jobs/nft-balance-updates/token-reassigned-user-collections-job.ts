import { ridb } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { fromBuffer, toBuffer } from "@/common/utils";
import { resyncUserCollectionsJob } from "@/jobs/nft-balance-updates/reynsc-user-collections-job";
import { updateUserCollectionsJob } from "@/jobs/nft-balance-updates/update-user-collections-job";
import _ from "lodash";
import { RabbitMQMessage } from "@/common/rabbit-mq";

export type TokenReassignedUserCollectionsJobPayload = {
  contract: string;
  tokenId: string;
  oldCollectionId: string;
  owner?: string;
};

export default class TokenReassignedUserCollectionsJob extends AbstractRabbitMqJobHandler {
  queueName = "token-reassigned-user-collections";
  maxRetries = 15;
  concurrency = 10;
  backoff = {
    type: "exponential",
    delay: 5000,
  } as BackoffStrategy;

  public async process(payload: TokenReassignedUserCollectionsJobPayload) {
    const { contract, tokenId, oldCollectionId, owner } = payload;
    let cursor = "";

    const values: {
      owner?: Buffer;
      contract: Buffer;
      tokenId: string;
      limit: number;
    } = {
      limit: 1000,
      contract: toBuffer(contract),
      tokenId,
    };

    if (owner) {
      cursor = `AND owner > $/owner/`;
      values.owner = toBuffer(owner);
    }

    // Resync owners collections count
    const results = await ridb.manyOrNone(
      `
        SELECT owner, amount
        FROM nft_balances
        WHERE contract = $/contract/
        AND token_id = $/tokenId/
        AND amount > 0
        ${cursor}
        ORDER BY owner ASC
        LIMIT $/limit/
      `,
      values
    );

    if (results) {
      if (oldCollectionId) {
        await resyncUserCollectionsJob.addToQueue(
          results.map((result) => ({
            user: fromBuffer(result.owner),
            collectionId: oldCollectionId,
          }))
        );
      }

      await updateUserCollectionsJob.addToQueue(
        results.map((result) => ({
          toAddress: fromBuffer(result.owner),
          contract,
          tokenId,
          amount: result.amount,
        }))
      );

      // Check if there are more potential users to sync
      if (results.length == values.limit) {
        const lastItem = _.last(results);

        return {
          addToQueue: true,
          lastOwner: fromBuffer(lastItem.owner),
        };
      }
    }

    return { addToQueue: false };
  }

  public async onCompleted(
    rabbitMqMessage: RabbitMQMessage,
    processResult: {
      addToQueue: boolean;
      lastOwner?: string;
    }
  ) {
    if (processResult.addToQueue) {
      await this.addToQueue({ ...rabbitMqMessage.payload, owner: processResult.lastOwner });
    }
  }

  public async addToQueue(payload: TokenReassignedUserCollectionsJobPayload) {
    await this.send({ payload });
  }
}

export const tokenReassignedUserCollectionsJob = new TokenReassignedUserCollectionsJob();
