import { idb, ridb } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { regex, toBuffer } from "@/common/utils";
import { Collections } from "@/models/collections";
import _ from "lodash";
import { getNetworkSettings } from "@/config/network";

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
    let contract = "";
    let newBalanceResults;
    let isSpam;

    if (collectionId.match(regex.address)) {
      // If a non shared contract
      contract = collectionId;

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
        contract: toBuffer(contract),
      });
    } else if (collectionId.match(/^0x[a-fA-F0-9]{40}:\d+:\d+$/)) {
      // If a token range collection
      const collection = await Collections.getById(collectionId);

      if (collection && !_.isEmpty(collection.tokenIdRange)) {
        contract = collection.contract;
        isSpam = collection.isSpam;

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
          contract: toBuffer(contract),
          tokenIdRange: `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`,
        });
      }
    } else {
      // If a token list collection
      [contract] = collectionId.split(":");

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
      if (_.isUndefined(isSpam)) {
        const collection = await Collections.getById(collectionId);

        if (collection) {
          isSpam = collection.isSpam;
        }
      }

      await idb.none(
        `
            INSERT INTO user_collections (owner, collection_id, contract, token_count, is_spam)
            VALUES ($/owner/, $/collection/, $/contract/, $/amount/, $/isSpam/)
            ON CONFLICT (owner, collection_id)
            DO UPDATE SET token_count = $/amount/, is_spam = $/isSpam/, updated_at = now();
          `,
        {
          owner: toBuffer(user),
          collection: collectionId,
          contract: toBuffer(contract),
          amount: newBalanceResults.amount,
          isSpam: isSpam ?? 0,
        }
      );
    }
  }

  public async addToQueue(payload: ResyncUserCollectionsJobPayload[], delay = 0) {
    const filteredPayload = payload.filter(
      (p) => p.collectionId && !_.includes(getNetworkSettings().burnAddresses, p.user)
    );

    if (!_.isEmpty(filteredPayload)) {
      await this.sendBatch(
        filteredPayload.map((p) => ({ payload: p, jobId: `${p.user}:${p.collectionId}`, delay }))
      );
    }
  }
}

export const resyncUserCollectionsJob = new ResyncUserCollectionsJob();
