import { idb, ridb } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { regex, toBuffer } from "@/common/utils";
import { Collections } from "@/models/collections";
import _ from "lodash";

export type ResyncUserCollectionsJobPayload = {
  user: string;
  collectionId: string;
};

export default class ResyncUserCollectionsJob extends AbstractRabbitMqJobHandler {
  queueName = "resync-user-collections";
  maxRetries = 15;
  concurrency = 15;
  lazyMode = true;
  backoff = {
    type: "exponential",
    delay: 5000,
  } as BackoffStrategy;

  protected async process(payload: ResyncUserCollectionsJobPayload) {
    const { user, collectionId } = payload;
    let newBalanceResults;

    if (collectionId.match(regex.address)) {
      // If a non shared contract
      // Calc the user balance
      const query = `
        SELECT owner, SUM(amount) AS "amount"
        FROM nft_balances
        WHERE owner = $/owner/
        AND contract = $/contract/
        AND amount > 0
        GROUP BY owner
      `;

      newBalanceResults = await ridb.oneOrNone(query, {
        owner: toBuffer(user),
        contract: toBuffer(collectionId),
      });
    } else if (collectionId.match(/^0x[a-fA-F0-9]{40}:\d+:\d+$/)) {
      // If a token range collection
      const collection = await Collections.getById(collectionId);

      if (collection && !_.isEmpty(collection.tokenIdRange)) {
        const query = `            
          SELECT owner, SUM(amount) AS "amount"
          FROM nft_balances
          WHERE owner = $/owner/
          AND contract = $/contract/
          AND token_id <@ $/tokenIdRange:raw/
          AND amount > 0
          GROUP BY owner
        `;

        newBalanceResults = await ridb.oneOrNone(query, {
          owner: toBuffer(user),
          contract: toBuffer(collection.contract),
          tokenIdRange: `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`,
        });
      }
    } else {
      // If a token list collection
      const [contract] = collectionId.split(":");

      const query = `            
        SELECT owner, SUM(amount) AS "amount"
        FROM nft_balances
        WHERE owner = $/owner/
        AND contract = $/contract/
        AND token_id IN (SELECT token_id FROM tokens WHERE collection_id = $/collection/)
        AND amount > 0
        GROUP BY owner
      `;

      newBalanceResults = await ridb.oneOrNone(query, {
        owner: toBuffer(user),
        contract: toBuffer(contract),
        collection: collectionId,
      });
    }

    if (newBalanceResults) {
      await idb.none(
        `
            UPDATE user_collections
            SET token_count = $/amount/
            WHERE owner = $/user/
            AND collection_id = $/collection/
          `,
        {
          owner: toBuffer(user),
          collection: collectionId,
          amount: newBalanceResults.amount,
        }
      );
    }
  }

  public async addToQueue(payload: ResyncUserCollectionsJobPayload, delay = 0) {
    await this.send({ payload, jobId: `${payload.user}:${payload.collectionId}` }, delay);
  }
}

export const resyncUserCollectionsJob = new ResyncUserCollectionsJob();
