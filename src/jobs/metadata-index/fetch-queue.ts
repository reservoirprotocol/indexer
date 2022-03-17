import { AddressZero } from "@ethersproject/constants";
import axios from "axios";
import { Job, Queue, QueueScheduler, Worker } from "bullmq";
import { randomUUID } from "crypto";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { network } from "@/common/provider";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";

const QUEUE_NAME = "metadata-index-fetch-queue";

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
    timeout: 2 * 60 * 1000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  type TokenMetadata = {
    contract: string;
    tokenId: string;
    name?: string;
    description?: string;
    imageUrl?: string;
    attributes: {
      key: string;
      value: string;
      kind: "string" | "number" | "date" | "range";
      rank?: number;
    }[];
  };

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { kind, data } = job.data as MetadataIndexInfo;

      try {
        let callback: () => Promise<void> = async () => {
          // This callback is to be called after the current job executed
          // successfully. It's needed to allow triggering any other jobs
          // that act as a continuation of the current one. By default it
          // is empty since not all indexing methods need it.
        };

        let url: string | undefined;
        if (kind === "full-collection") {
          if (data.method === "opensea") {
            let contractContinuation = toBuffer(AddressZero);
            let tokenIdContinuation = "0";
            if (data.continuation) {
              const [contract, tokenId] = data.continuation.split("_");
              contractContinuation = toBuffer(contract);
              tokenIdContinuation = tokenId;
            }

            const limit = 20;
            const tokens = await idb
              .manyOrNone(
                `
                  SELECT
                    tokens.contract,
                    tokens.token_id
                  FROM tokens
                  WHERE tokens.collection_id = $/collection/
                    AND (tokens.contract, tokens.token_id) > ($/contract/, $/tokenId/)
                  LIMIT ${limit}
                `,
                {
                  collection: data.collection,
                  contract: contractContinuation,
                  tokenId: tokenIdContinuation,
                }
              )
              .then((result) =>
                result.map((r) => ({
                  contract: fromBuffer(r.contract),
                  tokenId: r.token_id,
                }))
              );

            if (tokens && tokens.length) {
              const searchParams = new URLSearchParams();
              searchParams.append("method", data.method);
              searchParams.append("contract", tokens[0].contract);
              for (const { tokenId } of tokens) {
                searchParams.append("tokenIds", tokenId);
              }

              url = `${
                config.metadataApiBaseUrl
              }/v3/${network}/tokens?${searchParams.toString()}`;

              callback = async () => {
                if (tokens.length === limit) {
                  const last = tokens[tokens.length - 1];
                  await addToQueue([
                    {
                      kind,
                      data: {
                        ...data,
                        continuation: `${last.contract}_${last.tokenId}`,
                      },
                    },
                  ]);
                }
              };
            }
          } else if (data.method === "rarible") {
            const searchParams = new URLSearchParams();
            searchParams.append("collection", data.collection);

            url = `${
              config.metadataApiBaseUrl
            }/v3/${network}/rarible-full-collection?${searchParams.toString()}`;
          }
        } else if (kind === "single-token") {
          const searchParams = new URLSearchParams();
          searchParams.append("method", data.method);
          searchParams.append("contract", data.contract);
          searchParams.append("tokenIds", data.tokenId);

          url = `${
            config.metadataApiBaseUrl
          }/v3/${network}/tokens?${searchParams.toString()}`;
        }

        if (url) {
          const metadataResult = await axios
            .get(url, { timeout: 2 * 60 * 1000 })
            .then(({ data }) => data);

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const metadata: TokenMetadata[] = (metadataResult as any).metadata;

          await metadataIndexWrite.addToQueue(
            metadata.map((m) => ({
              ...m,
              collection: data.collection,
            }))
          );

          await callback();
        }
      } catch (error) {
        logger.error(
          QUEUE_NAME,
          `Failed to process metadata index info ${JSON.stringify(
            job.data
          )}: ${error}`
        );
        throw error;
      }
    },
    { connection: redis.duplicate(), concurrency: 1 }
  );
  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

// We support the following metadata indexing methods.
type IndexingMethod = "opensea" | "rarible";

export type MetadataIndexInfo =
  | {
      kind: "full-collection";
      data: {
        method: IndexingMethod;
        collection: string;
        continuation?: string;
      };
    }
  | {
      kind: "single-token";
      data: {
        method: IndexingMethod;
        collection: string;
        contract: string;
        tokenId: string;
      };
    };

export const addToQueue = async (metadataIndexInfos: MetadataIndexInfo[]) => {
  await queue.addBulk(
    metadataIndexInfos.map((metadataIndexInfo) => ({
      name: randomUUID(),
      data: metadataIndexInfo,
    }))
  );
};
