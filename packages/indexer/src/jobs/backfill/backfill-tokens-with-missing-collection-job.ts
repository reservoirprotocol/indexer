import { idb, pgp } from "@/common/db";

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

import { fromBuffer, now, toBuffer } from "@/common/utils";
import { mintQueueJob } from "@/jobs/token-updates/mint-queue-job";
import { logger } from "@/common/logger";
import { hasExtendCollectionHandler } from "@/metadata/extend";
import _ from "lodash";

export type CursorInfo = {
  contract: string;
  tokenId: string;
};

export type BackfillTokensWithMissingCollectionJobPayload = {
  contract?: string;
  cursor?: CursorInfo;
};

export class BackfillTokensWithMissingCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "backfill-tokens-with-missing-collection-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  singleActiveConsumer = true;

  public async process(payload: BackfillTokensWithMissingCollectionJobPayload) {
    const { contract, cursor } = payload;
    const columns = new pgp.helpers.ColumnSet(["contract", "token_id", "collection"], {
      table: "tokens",
    });

    let contractFilter = "";
    let continuationFilter = "";

    const limit = 200;

    if (contract) {
      contractFilter = `AND tokens.contract = $/contract/`;
    }

    if (cursor) {
      continuationFilter = `AND (tokens.contract, tokens.token_id) > ($/cursorContract/, $/cursorTokenId/)`;
    }

    const results = await idb.manyOrNone(
      `
          SELECT
            tokens.contract,
            tokens.token_id,
            tokens.minted_timestamp
          FROM tokens
          WHERE tokens.collection_id IS NULL
          ${contractFilter}
          ${continuationFilter}
          ORDER BY tokens.contract, tokens.token_id
          LIMIT $/limit/
        `,
      {
        cursorContract: cursor?.contract ? toBuffer(cursor.contract) : undefined,
        cursorTokenId: cursor?.tokenId,
        contract: contract ? toBuffer(contract) : undefined,
        limit,
      }
    );

    if (results.length) {
      const tokensToMint = [];
      const tokensToUpdate = [];

      for (const token of results) {
        if (hasExtendCollectionHandler(fromBuffer(token.contract))) {
          tokensToMint.push({
            contract: fromBuffer(token.contract),
            tokenId: token.token_id,
            mintedTimestamp: token.minted_timestamp || now(),
          });
        } else {
          tokensToUpdate.push({
            contract: token.contract,
            token_id: token.token_id,
            collection: fromBuffer(token.contract),
          });
        }
      }

      if (!_.isEmpty(tokensToMint)) {
        await mintQueueJob.addToQueue(tokensToMint);
      }

      if (!_.isEmpty(tokensToUpdate)) {
        const updateQuery = `
          UPDATE tokens
          SET collection_id = x.collectionColumn
          FROM (VALUES ${pgp.helpers.values(
            tokensToUpdate,
            columns
          )}) AS x(contractColumn, tokenIdColumn, collectionColumn)
          WHERE CAST(x.contractColumn AS bytea) = tokens.contract
          AND x.tokenIdColumn::numeric = tokens.token_id`;

        await idb.none(updateQuery);
      }

      if (results.length >= limit) {
        const lastResult = results[results.length - 1];

        const nextCursor = {
          contract: fromBuffer(lastResult.contract),
          tokenId: lastResult.token_id,
        };

        await this.addToQueue(contract, nextCursor);

        logger.info(
          this.queueName,
          `Sent to mint ${tokensToMint.length} updated ${
            tokensToUpdate.length
          }. cursor=${JSON.stringify(nextCursor)}`
        );
      }
    }
  }

  public async addToQueue(contract?: string, cursor?: CursorInfo, delay = 0) {
    await this.send(
      {
        payload: {
          contract,
          cursor,
        },
      },
      delay
    );
  }
}

export const backfillTokensWithMissingCollectionJob = new BackfillTokensWithMissingCollectionJob();
