import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import MetadataApi from "@/utils/metadata-api";
import { Tokens } from "@/models/tokens";

const QUEUE_NAME = "collection-updates-non-flagged-floor-ask-queue";

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    backoff: {
      type: "exponential",
      delay: 20000,
    },
    removeOnComplete: 10000,
    removeOnFail: 10000,
    timeout: 60000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { kind, collectionId, txHash, txTimestamp } = job.data as FloorAskInfo;

      logger.info(
        QUEUE_NAME,
        `Start. kind=${kind}, collectionId=${collectionId}, txHash=${txHash}, txTimestamp=${txTimestamp}`
      );

      try {
        const tokenResult = await idb.oneOrNone(
          `
                  SELECT
                      tokens.contract,
                      tokens.token_id
                    FROM tokens
                    WHERE tokens.collection_id = $/collectionId/
                    AND tokens.floor_sell_value IS NOT NULL 
                    ORDER BY tokens.floor_sell_value
                    LIMIT 1`,
          {
            collectionId,
          }
        );

        logger.info(
          QUEUE_NAME,
          `tokenResult. kind=${kind}, collectionId=${collectionId}, txHash=${txHash}, txTimestamp=${txTimestamp}, tokenResult=${JSON.stringify(
            tokenResult
          )}`
        );

        if (tokenResult) {
          const contract = fromBuffer(tokenResult.contract);
          const tokenId = tokenResult.token_id;

          const tokensMetadata = await MetadataApi.getTokensMetadata(
            [
              {
                contract,
                tokenId,
              },
            ],
            true
          );

          logger.info(
            QUEUE_NAME,
            `tokensMetadata. kind=${kind}, collectionId=${collectionId}, txHash=${txHash}, txTimestamp=${txTimestamp}, tokenResult=${JSON.stringify(
              tokenResult
            )}, tokensMetadata=${JSON.stringify(tokensMetadata)}`
          );

          const tokenMetadata = tokensMetadata[0];
          const isFlagged = Number(tokenMetadata.flagged);

          await Tokens.update(contract, tokenId, {
            isFlagged,
            lastFlagUpdate: new Date().toISOString(),
          });

          if (isFlagged) {
            logger.info(
              QUEUE_NAME,
              `Token Is Flagged. kind=${kind}, collectionId=${collectionId}, txHash=${txHash}, txTimestamp=${txTimestamp}, tokenResult=${JSON.stringify(
                tokenResult
              )}, tokensMetadata=${JSON.stringify(tokensMetadata)}`
            );

            await addToQueue([
              {
                kind,
                collectionId,
                txHash,
                txTimestamp,
              },
            ]);
          } else {
            logger.info(
              QUEUE_NAME,
              `Token Is NOT Flagged. kind=${kind}, collectionId=${collectionId}, txHash=${txHash}, txTimestamp=${txTimestamp}, tokenResult=${JSON.stringify(
                tokenResult
              )}, tokensMetadata=${JSON.stringify(tokensMetadata)}`
            );

            await idb.oneOrNone(
              `
                        WITH y AS (
                          UPDATE collections SET
                            non_flagged_floor_sell_id = x.floor_sell_id,
                            non_flagged_floor_sell_value = x.floor_sell_value,
                            non_flagged_floor_sell_maker = x.floor_sell_maker,
                            non_flagged_floor_sell_source_id_int = x.source_id_int,
                            non_flagged_floor_sell_valid_between = x.valid_between,
                            updated_at = now()
                          FROM (
                                SELECT
                                  tokens.floor_sell_id,
                                  tokens.floor_sell_value,
                                  tokens.floor_sell_maker,
                                  orders.source_id_int,
                                  orders.valid_between
                                FROM tokens
                                JOIN orders
                                  ON tokens.floor_sell_id = orders.id
                                WHERE tokens.contract = $/contract/
                                AND tokens.token_id = $/tokenId/
                          ) x
                          WHERE collections.id = $/collection/
                            AND (
                              collections.non_flagged_floor_sell_id IS DISTINCT FROM x.floor_sell_id
                              OR collections.non_flagged_floor_sell_value IS DISTINCT FROM x.floor_sell_value
                            )
                          RETURNING
                            collections.non_flagged_floor_sell_id,
                            collections.non_flagged_floor_sell_value,
                            (
                              SELECT
                                collections.non_flagged_floor_sell_value
                              FROM collections
                              WHERE id = $/collection/
                            ) AS old_non_flagged_floor_sell_value,
                            collections.non_flagged_floor_sell_maker,
                            collections.non_flagged_floor_sell_source_id_int,
                            collections.non_flagged_floor_sell_valid_between
                        )
                        INSERT INTO collection_non_flagged_floor_sell_events(
                          kind,
                          collection_id,
                          contract,
                          token_id,
                          order_id,
                          order_source_id_int,
                          order_valid_between,
                          maker,
                          price,
                          previous_price,
                          tx_hash,
                          tx_timestamp
                        )
                        SELECT
                          $/kind/::token_floor_sell_event_kind_t,
                          $/collection/,
                          z.contract,
                          z.token_id,
                          y.non_flagged_floor_sell_id,
                          y.non_flagged_floor_sell_source_id_int,
                          y.non_flagged_floor_sell_valid_between,
                          y.non_flagged_floor_sell_maker,
                          y.non_flagged_floor_sell_value,
                          y.old_non_flagged_floor_sell_value,
                          $/txHash/,
                          $/txTimestamp/
                        FROM y
                        LEFT JOIN LATERAL (
                          SELECT
                            token_sets_tokens.contract,
                            token_sets_tokens.token_id
                          FROM token_sets_tokens
                          JOIN orders
                            ON token_sets_tokens.token_set_id = orders.token_set_id
                          WHERE orders.id = y.non_flagged_floor_sell_id
                          LIMIT 1
                        ) z ON TRUE
                      `,
              {
                kind,
                collection: collectionId,
                contract: toBuffer(contract),
                tokenId,
                txHash: txHash ? toBuffer(txHash) : null,
                txTimestamp,
              }
            );
          }
        } else {
          logger.info(
            QUEUE_NAME,
            `No Floor Ask. kind=${kind}, collectionId=${collectionId}, txHash=${txHash}, txTimestamp=${txTimestamp}, tokenResult=${JSON.stringify(
              tokenResult
            )}`
          );

          await idb.oneOrNone(
            `
                        WITH y AS (
                          UPDATE collections SET
                            non_flagged_floor_sell_id = null,
                            non_flagged_floor_sell_value = null,
                            non_flagged_floor_sell_maker = null,
                            non_flagged_floor_sell_source_id_int = null,
                            non_flagged_floor_sell_valid_between = null,
                            updated_at = now()
                          WHERE collections.id = $/collection/
                          RETURNING
                            collections.non_flagged_floor_sell_id,
                            collections.non_flagged_floor_sell_value,
                            (
                              SELECT
                                collections.non_flagged_floor_sell_value
                              FROM collections
                              WHERE id = $/collection/
                            ) AS old_non_flagged_floor_sell_value,
                            collections.non_flagged_floor_sell_maker,
                            collections.non_flagged_floor_sell_source_id_int,
                            collections.non_flagged_floor_sell_valid_between
                        )
                        INSERT INTO collection_non_flagged_floor_sell_events(
                          kind,
                          collection_id,
                          contract,
                          token_id,
                          order_id,
                          order_source_id_int,
                          order_valid_between,
                          maker,
                          price,
                          previous_price,
                          tx_hash,
                          tx_timestamp
                        )
                        SELECT
                          $/kind/::token_floor_sell_event_kind_t,
                          $/collection/,
                          null,
                          null,
                          y.non_flagged_floor_sell_id,
                          y.non_flagged_floor_sell_source_id_int,
                          y.non_flagged_floor_sell_valid_between,
                          y.non_flagged_floor_sell_maker,
                          y.non_flagged_floor_sell_value,
                          y.old_non_flagged_floor_sell_value,
                          $/txHash/,
                          $/txTimestamp/
                        FROM y
                      `,
            {
              kind,
              collection: collectionId,
              txHash: txHash ? toBuffer(txHash) : null,
              txTimestamp,
            }
          );
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process collection floor-ask info ${JSON.stringify(job.data)}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 10 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export type FloorAskInfo = {
  kind: string;
  collectionId: string;
  txHash: string | null;
  txTimestamp: number | null;
};

export const addToQueue = async (floorAskInfos: FloorAskInfo[]) => {
  await queue.addBulk(
    floorAskInfos.map((floorAskInfo) => ({
      name: `${floorAskInfo.collectionId}`,
      data: floorAskInfo,
    }))
  );
};
