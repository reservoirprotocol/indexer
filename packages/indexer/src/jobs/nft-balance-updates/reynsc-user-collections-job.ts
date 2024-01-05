import { idb, redb, ridb } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { fromBuffer, regex, toBuffer } from "@/common/utils";
import { Collections } from "@/models/collections";
import _ from "lodash";
import { config } from "@/config/index";
import { getNetworkSettings } from "@/config/network";

export type ResyncUserCollectionsJobPayload = {
  user: string;
  collectionId?: string;
  cursor?: {
    contract: string;
    tokenId: string;
  };
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
    const { user, collectionId, cursor } = payload;
    let contract = "";
    let newBalanceResults;
    let isSpam;

    if (config.chainId === 137 && collectionId === "0xcf2576238640a3a232fa6046d549dfb753a805f4") {
      return;
    }

    if (_.isUndefined(collectionId)) {
      const values: {
        owner: Buffer;
        limit: number;
        contract?: Buffer;
        tokenId?: string;
      } = {
        owner: toBuffer(user),
        limit: 1000,
      };

      let cursorFilter = "";
      if (cursor) {
        cursorFilter = `AND (contract, token_id) > ($/contract/, $/tokenId/)`;
        values.contract = toBuffer(cursor.contract);
        values.tokenId = cursor.tokenId;
      }

      // If collectionId is empty we resync all user's collections
      const query = `
        SELECT contract, token_id, t.collection_id
        FROM nft_balances
          JOIN LATERAL (
             SELECT collection_id
             FROM tokens
             WHERE nft_balances.contract = tokens.contract
             AND nft_balances.token_id = tokens.token_id
             AND tokens.collection_id IS NOT NULL
             AND NOT EXISTS (SELECT FROM user_collections uc WHERE owner = $/owner/ AND uc.collection_id = tokens.collection_id)
          ) t ON TRUE
        WHERE owner = $/owner/
        ${cursorFilter}
        AND amount > 0
        ORDER BY contract, token_id
        LIMIT $/limit/
      `;

      const results = await redb.manyOrNone(query, values);
      const jobs = [];

      if (results) {
        for (const result of results) {
          if (_.isNull(result.collection_id)) {
            continue;
          }

          jobs.push({
            user,
            collectionId: result.collection_id,
          });
        }

        if (!_.isEmpty(jobs)) {
          await this.addToQueue(jobs);
        }

        // If there are potentially more collections for this user
        if (results.length === values.limit) {
          await this.addToQueue([
            {
              user,
              cursor: {
                contract: fromBuffer(_.last(results).contract),
                tokenId: _.last(results).token_id,
              },
            },
          ]);
        }
      }
    } else if (collectionId.match(regex.address)) {
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
      if (_.isUndefined(isSpam) && !_.isUndefined(collectionId)) {
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
    } else {
      // If no results make sure the user balance is 0
      await idb.none(
        `
            UPDATE user_collections
            SET token_count = 0
            WHERE owner = $/owner/
            AND collection_id = $/collection/;
          `,
        {
          owner: toBuffer(user),
          collection: collectionId,
        }
      );
    }
  }

  public async addToQueue(payload: ResyncUserCollectionsJobPayload[], delay = 0) {
    const filteredPayload = payload.filter(
      (p) => !_.includes(getNetworkSettings().burnAddresses, p.user)
    );

    if (!_.isEmpty(filteredPayload)) {
      await this.sendBatch(
        filteredPayload.map((p) => ({ payload: p, jobId: `${p.user}:${p.collectionId}`, delay }))
      );
    }
  }
}

export const resyncUserCollectionsJob = new ResyncUserCollectionsJob();
