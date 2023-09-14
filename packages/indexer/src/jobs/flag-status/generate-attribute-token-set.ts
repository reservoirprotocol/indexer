/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Collections } from "@/models/collections";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers/merkle";
import * as tokenSet from "@/orderbook/token-sets";
import { generateSchemaHash } from "@/orderbook/orders/utils";
import { TokenSet } from "@/orderbook/token-sets/token-list";
import { Attributes } from "@/models/attributes";
import { redb } from "@/common/db";
import _ from "lodash";

const QUEUE_NAME = "flag-status-generate-attribute-token-set";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { attributeId } = job.data;

      const attribute = await Attributes.getById(attributeId);

      if (!attribute) {
        logger.warn(QUEUE_NAME, `Missing attribute. attributeId=${attributeId}`);
      }

      if (!attribute?.collectionId) {
        logger.warn(QUEUE_NAME, `No collection for attribute. attributeId=${attributeId}`);
      }

      const collection = await Collections.getById(attribute!.collectionId);

      if (!collection || collection.tokenCount > config.maxTokenSetSize) {
        return;
      }

      const tokens = await getAttributeTokens(attributeId);
      const flaggedTokens = tokens.filter((r) => r.isFlagged);

      if (flaggedTokens.length === 0) {
        logger.info(
          QUEUE_NAME,
          `No Flagged tokens. contract=${collection.contract}, collectionId=${collection.id}, attributeId=${attributeId}`
        );

        return;
      }

      const nonFlaggedTokensIds = tokens.filter((r) => !r.isFlagged).map((r) => r.tokenId);

      if (nonFlaggedTokensIds.length === 0) {
        logger.info(
          QUEUE_NAME,
          `No Non Flagged tokens. contract=${collection.contract}, collectionId=${collection.id}, attributeId=${attributeId}`
        );

        return;
      }

      const merkleTree = generateMerkleTree(nonFlaggedTokensIds);
      const tokenSetId = `list:${collection.contract}:${merkleTree.getHexRoot()}`;

      const schema = {
        kind: "attribute",
        data: {
          collection: collection.id,
          isNonFlagged: true,
          attributes: [
            {
              key: attribute!.key,
              value: attribute!.value,
            },
          ],
        },
      };

      // Create new token set for non flagged tokens
      const ts = await tokenSet.tokenList.save([
        {
          id: tokenSetId,
          schema,
          schemaHash: generateSchemaHash(schema),
          items: {
            contract: collection.contract,
            tokenIds: nonFlaggedTokensIds,
          },
        } as TokenSet,
      ]);

      if (ts.length !== 1) {
        logger.warn(
          QUEUE_NAME,
          `Invalid Token Set. contract=${collection.contract}, collectionId=${collection.id}, attributeId=${attributeId}, tokenSetId=${tokenSetId}`
        );
      } else {
        logger.info(
          QUEUE_NAME,
          `Generated New Non Flagged TokenSet. contract=${collection.contract}, collectionId=${collection.id}, attributeId=${attributeId}, tokenSetId=${tokenSetId}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

const getAttributeTokens = async (attributeId: number) => {
  const limit = 5000;
  let checkForMore = true;
  let continuation = "";

  let tokens: { tokenId: string; isFlagged: number }[] = [];

  while (checkForMore) {
    const query = `
            SELECT token_attributes.token_id, tokens.is_flagged
            FROM token_attributes
            JOIN tokens ON tokens.contract = token_attributes.contract AND tokens.token_id = token_attributes.token_id
            WHERE attribute_id = $/attributeId/
            ${continuation}
            ORDER BY token_attributes.token_id ASC
            LIMIT ${limit}
      `;

    const result = await redb.manyOrNone(query, {
      attributeId,
    });

    if (!_.isEmpty(result)) {
      tokens = _.concat(
        tokens,
        _.map(result, (r) => ({
          tokenId: r.token_id,
          isFlagged: r.is_flagged,
        }))
      );
      continuation = `AND token_attributes.token_id > ${_.last(result).token_id}`;
    }

    if (limit > _.size(result)) {
      checkForMore = false;
    }
  }

  return tokens;
};

export const addToQueue = async (attributeIds: number[]) => {
  await queue.addBulk(
    attributeIds.map((attributeId) => ({
      name: randomUUID(),
      data: { attributeId },
    }))
  );
};
