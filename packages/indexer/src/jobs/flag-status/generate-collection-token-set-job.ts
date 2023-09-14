import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { redb } from "@/common/db";
import { logger } from "@/common/logger";
import { config } from "@/config/index";
import { Collections } from "@/models/collections";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/common/helpers";
import { generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import { TokenSet } from "@/orderbook/token-sets/token-list";
import _ from "lodash";

export type FillPostProcessJobPayload = {
  contract: string;
  collectionId: string;
};

export class GenerateCollectionTokenSetJob extends AbstractRabbitMqJobHandler {
  queueName = "flag-status-generate-collection-token-set";
  maxRetries = 10;
  concurrency = 1;
  lazyMode = true;

  protected async process(payload: FillPostProcessJobPayload) {
    const { contract, collectionId } = payload;
    const collection = await Collections.getById(collectionId);

    if (!collection || collection.tokenCount > config.maxTokenSetSize) {
      return;
    }

    const tokens = await this.getCollectionTokens(collectionId);
    const flaggedTokens = tokens.filter((r) => r.isFlagged);

    if (flaggedTokens.length === 0) {
      logger.info(
        this.queueName,
        `No Flagged tokens. contract=${contract}, collectionId=${collectionId}`
      );

      if (collection.nonFlaggedTokenSetId) {
        logger.info(
          this.queueName,
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
          this.queueName,
          `Invalid Token Set. contract=${contract}, collectionId=${collectionId}, generatedNonFlaggedTokenSetId=${tokenSetId}`
        );
      } else {
        logger.info(
          this.queueName,
          `Generated New Non Flagged TokenSet. contract=${contract}, collectionId=${collectionId}, tokenSetId=${collection.tokenSetId}, nonFlaggedTokenSetId=${collection.nonFlaggedTokenSetId}, generatedNonFlaggedTokenSetId=${tokenSetId}, flaggedTokenCount=${flaggedTokens.length}`
        );

        // Set the new non flagged tokens token set
        await Collections.update(collectionId, { nonFlaggedTokenSetId: tokenSetId });
      }
    } else {
      logger.info(
        this.queueName,
        `Non Flagged TokenSet Already Exists. contract=${contract}, collectionId=${collectionId}, tokenSetId=${collection.tokenSetId}, nonFlaggedTokenSetId=${collection.nonFlaggedTokenSetId}, generatedNonFlaggedTokenSetId=${tokenSetId}`
      );
    }
  }

  public async getCollectionTokens(collectionId: string) {
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
  }

  public async addToQueue(params: FillPostProcessJobPayload) {
    await this.send({ payload: params });
  }
}

export const generateCollectionTokenSetJob = new GenerateCollectionTokenSetJob();
