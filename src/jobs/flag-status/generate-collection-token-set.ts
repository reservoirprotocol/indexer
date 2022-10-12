/* eslint-disable @typescript-eslint/no-explicit-any */

import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";
import _ from "lodash";

import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

import { Collections } from "@/models/collections";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers/merkle";
import * as tokenSet from "@/orderbook/token-sets";
import { generateSchemaHash } from "@/orderbook/orders/utils";
import { TokenSet } from "@/orderbook/token-sets/token-list";
import { idb, redb } from "@/common/db";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import * as flagStatusGenerateAttributeTokenSet from "@/jobs/flag-status/generate-attribute-token-set";
import { toBuffer } from "@/common/utils";
import { HashZero } from "@ethersproject/constants";

const QUEUE_NAME = "flag-status-generate-collection-token-set";

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
      const { contract, collectionId } = job.data;
      const collection = await Collections.getById(collectionId);

      if (!collection || collection.tokenCount > config.maxTokenSetSize) {
        return;
      }

      const tokens = await getCollectionTokens(collectionId);
      const flaggedTokens = tokens.filter((r) => r.isFlagged);

      if (flaggedTokens.length === 0) {
        logger.info(
          QUEUE_NAME,
          `No Flagged tokens. contract=${contract}, collectionId=${collectionId}`
        );

        if (collection.nonFlaggedTokenSetId) {
          logger.info(
            QUEUE_NAME,
            `Removed Non Flagged TokenSet from collection. contract=${contract}, collectionId=${collectionId}, tokenSetId=${collection.tokenSetId}, nonFlaggedTokenSetId=${collection.nonFlaggedTokenSetId}`
          );

          await Collections.update(collectionId, { nonFlaggedTokenSetId: null });
        }

        return;
      }

      const nonFlaggedTokensIds = tokens.filter((r) => !r.isFlagged).map((r) => r.tokenId);

      const merkleTree = generateMerkleTree(nonFlaggedTokensIds);
      const tokenSetId = `list:${contract}:${merkleTree.getHexRoot()}`;

      if (tokenSetId != collection.nonFlaggedTokenSetId) {
        const schema = {
          kind: "collection-non-flagged",
          data: {
            collection: collection.id,
          },
        };

        const schemaHash = generateSchemaHash(schema);

        // Create new token set for non flagged tokens
        const ts = await tokenSet.tokenList.save([
          {
            id: tokenSetId,
            schema,
            schemaHash,
            items: {
              contract,
              tokenIds: nonFlaggedTokensIds,
            },
          } as TokenSet,
        ]);

        if (ts.length !== 1) {
          logger.warn(
            QUEUE_NAME,
            `Invalid Token Set. contract=${contract}, collectionId=${collectionId}, generatedNonFlaggedTokenSetId=${tokenSetId}`
          );
        } else {
          logger.info(
            QUEUE_NAME,
            `Generated New Non Flagged TokenSet. contract=${contract}, collectionId=${collectionId}, tokenSetId=${collection.tokenSetId}, nonFlaggedTokenSetId=${collection.nonFlaggedTokenSetId}, generatedNonFlaggedTokenSetId=${tokenSetId}, flaggedTokenCount=${flaggedTokens.length}`
          );

          // Set the new non flagged tokens token set
          await Collections.update(collectionId, { nonFlaggedTokenSetId: tokenSetId });

          await handleAttributes(
            contract,
            collectionId,
            flaggedTokens.map((r) => r.tokenId)
          );
          await handleOrders(contract, collectionId, tokenSetId, schemaHash);
        }
      } else {
        logger.info(
          QUEUE_NAME,
          `Non Flagged TokenSet Already Exists. contract=${contract}, collectionId=${collectionId}, tokenSetId=${collection.tokenSetId}, nonFlaggedTokenSetId=${collection.nonFlaggedTokenSetId}, generatedNonFlaggedTokenSetId=${tokenSetId}`
        );
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

const getCollectionTokens = async (collectionId: string) => {
  const limit = 5000;
  let checkForMore = true;
  let continuation = "";

  let tokens: { tokenId: string; isFlagged: number }[] = [];

  while (checkForMore) {
    const query = `
        SELECT token_id, is_flagged
        FROM tokens
        WHERE collection_id = $/collectionId/
        ${continuation}
        ORDER BY token_id ASC
        LIMIT ${limit}
      `;

    const result = await redb.manyOrNone(query, {
      collectionId,
    });

    if (!_.isEmpty(result)) {
      tokens = _.concat(
        tokens,
        _.map(result, (r) => ({
          tokenId: r.token_id,
          isFlagged: r.is_flagged,
        }))
      );
      continuation = `AND token_id > ${_.last(result).token_id}`;
    }

    if (limit > _.size(result)) {
      checkForMore = false;
    }
  }

  return tokens;
};

const handleOrders = async (
  contract: string,
  collectionId: string,
  tokenSetId: string,
  tokenSetSchemaHash: string
) => {
  // Trigger new order flow for valid orders.
  const orders = await idb.manyOrNone(
    `
                UPDATE orders
                SET token_set_schema_hash = $/tokenSetSchemaHash/
                WHERE orders.side = 'buy'
                AND orders.fillability_status = 'fillable'
                AND orders.approval_status = 'approved'
                AND orders.token_set_id = $/tokenSetId/
                AND orders.token_set_schema_hash = $/defaultSchemaHash/
                RETURNING orders.id
              `,
    {
      tokenSetId,
      tokenSetSchemaHash: toBuffer(tokenSetSchemaHash),
      defaultSchemaHash: toBuffer(HashZero),
    }
  );

  if (orders?.length) {
    logger.info(
      QUEUE_NAME,
      `Orders Found!. contract=${contract}, collectionId=${collectionId}, tokenSetId=${tokenSetId}, tokenSetSchemaHash=${tokenSetSchemaHash}, orders=${orders.length}`
    );

    await ordersUpdateById.addToQueue(
      orders.map(
        ({ id }) =>
          ({
            context: `new-order-${id}`,
            id,
            trigger: {
              kind: "new-order",
            },
          } as ordersUpdateById.OrderInfo)
      )
    );
  }
};

const handleAttributes = async (
  contract: string,
  collectionId: string,
  flaggedTokenIds: string[]
) => {
  // Calculate non flagged token set for related attributes
  const attributes = await redb.manyOrNone(
    `
            SELECT DISTINCT token_attributes.attribute_id
            FROM token_attributes
            WHERE token_attributes.collection_id = $/collectionId/      
            AND token_attributes.token_id IN ($/flaggedTokenIds:list/)   
          `,
    {
      collectionId,
      flaggedTokenIds,
    }
  );

  if (attributes?.length) {
    logger.info(
      QUEUE_NAME,
      `Attributes Found!. contract=${contract}, collectionId=${collectionId}, attributes=${attributes.length}`
    );

    await flagStatusGenerateAttributeTokenSet.addToQueue(
      attributes.map(({ attribute_id }) => attribute_id)
    );
  }
};

export const addToQueue = async (contract: string, collectionId: string) => {
  await queue.add(randomUUID(), { contract, collectionId });
};
