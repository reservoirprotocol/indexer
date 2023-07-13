import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";

import { idb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { fromBuffer, toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { mintsRefreshJob } from "@/jobs/mints/mints-refresh-job";
import {
  CollectionMint,
  CollectionMintStandard,
  simulateAndUpsertCollectionMint,
} from "@/orderbook/mints";
import * as detector from "@/orderbook/mints/calldata/detector";
import { getContractKind } from "@/orderbook/mints/calldata/helpers";
import MetadataApi from "@/utils/metadata-api";

export type MintsProcessJobPayload =
  | {
      by: "tx";
      data: {
        txHash: string;
      };
    }
  | {
      by: "collection";
      data: {
        standard: CollectionMintStandard;
        collection: string;
        tokenId?: string;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        additionalInfo?: any;
      };
    };

export class MintsProcessJob extends AbstractRabbitMqJobHandler {
  queueName = "mints-process";
  maxRetries = 3;
  concurrency = 30;
  lazyMode = true;

  protected async process(payload: MintsProcessJobPayload) {
    const { by, data } = payload;

    try {
      let collectionMints: CollectionMint[] = [];

      // Process new mints knowing a mint transaction
      if (by === "tx") {
        collectionMints = await detector.extractByTx(data.txHash);
      }

      // Process new mints knowing the collection (triggered from a standard-specific on-chain event)
      if (by === "collection") {
        // Make sure the collection exists
        const collectionExists = await idb.oneOrNone(
          "SELECT 1 FROM collections WHERE collections.id = $/collection/",
          {
            collection: data.collection,
          }
        );
        if (!collectionExists) {
          const collection = await MetadataApi.getCollectionMetadata(data.collection, "0", "", {
            indexingMethod:
              data.standard === "manifold"
                ? "manifold"
                : data.standard === "seadrop-v1.0"
                ? "opensea"
                : "onchain",
            additionalQueryParams:
              data.standard === "manifold"
                ? { instanceId: data.additionalInfo.instanceId }
                : undefined,
          });

          let tokenIdRange: string | null = null;
          if (collection.tokenIdRange) {
            tokenIdRange = `numrange(${collection.tokenIdRange[0]}, ${collection.tokenIdRange[1]}, '[]')`;
          } else if (collection.id === data.collection) {
            tokenIdRange = `'(,)'::numrange`;
          }

          // For covering the case where the token id range is null
          const tokenIdRangeParam = tokenIdRange ? "$/tokenIdRange:raw/" : "$/tokenIdRange/";

          await idb.none(
            `
              INSERT INTO collections (
                id,
                slug,
                name,
                metadata,
                contract,
                token_id_range,
                token_set_id,
                creator
              ) VALUES (
                $/id/,
                $/slug/,
                $/name/,
                $/metadata:json/,
                $/contract/,
                ${tokenIdRangeParam},
                $/tokenSetId/,
                $/creator/
              ) ON CONFLICT DO NOTHING
            `,
            {
              id: collection.id,
              slug: collection.slug,
              name: collection.name,
              metadata: collection.metadata,
              contract: toBuffer(collection.contract),
              tokenIdRange,
              tokenSetId: collection.tokenSetId,
              creator: collection.creator ? toBuffer(collection.creator) : null,
            }
          );
        }

        // Make sure the contract exists
        const contractResult = await idb.one(
          `
            SELECT
              contracts.kind,
              collections.contract
            FROM collections
            LEFT JOIN contracts
              ON collections.contract = contracts.address
            WHERE collections.id = $/collection/
          `,
          {
            collection: data.collection,
          }
        );
        if (!contractResult.kind) {
          const kind = await getContractKind(fromBuffer(contractResult.contract));
          if (!kind) {
            throw new Error("Could not detect contract kind");
          }

          await idb.none(
            `
              INSERT INTO contracts (
                address,
                kind
              ) VALUES (
                $/contract/,
                $/kind/
              ) ON CONFLICT DO NOTHING
            `,
            {
              contract: contractResult.contract,
              kind,
            }
          );
        }

        switch (data.standard) {
          case "manifold": {
            const c = new Contract(
              data.additionalInfo.extension,
              new Interface([
                `
                  function getClaim(address creatorContractAddress, uint256 instanceId) external view returns (
                    (
                      uint32 total,
                      uint32 totalMax,
                      uint32 walletMax,
                      uint48 startDate,
                      uint48 endDate,
                      uint8 storageProtocol,
                      bytes32 merkleRoot,
                      string location,
                      uint256 tokenId,
                      uint256 cost,
                      address payable paymentReceiver,
                      address erc20
                    )
                  )
                `,
              ]),
              baseProvider
            );

            collectionMints = await detector.manifold.extractByCollection(
              data.collection,
              (
                await c.getClaim(data.collection, data.additionalInfo.instanceId)
              ).tokenId.toString(),
              data.additionalInfo.extension
            );

            break;
          }

          case "seadrop-v1.0": {
            collectionMints = await detector.seadrop.extractByCollection(data.collection);

            break;
          }

          case "thirdweb": {
            collectionMints = await detector.thirdweb.extractByCollection(
              data.collection,
              data.tokenId
            );

            break;
          }

          case "zora": {
            collectionMints = await detector.zora.extractByCollection(data.collection);

            break;
          }
        }

        // Also refresh (to clean up any old stages)
        await mintsRefreshJob.addToQueue({ collection: data.collection });
      }

      for (const collectionMint of collectionMints) {
        const result = await simulateAndUpsertCollectionMint(collectionMint);
        logger.info("mints-process", JSON.stringify({ success: result, collectionMint }));
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      logger.error(
        this.queueName,
        `Failed to process mint ${JSON.stringify(payload)}: ${error} (${error.stack})`
      );
      throw error;
    }
  }

  public async addToQueue(mints: MintsProcessJobPayload[], force = false) {
    await this.sendBatch(
      mints.map((mint) => {
        return {
          payload: mint,
          jobId: force ? undefined : mint.by === "tx" ? mint.data.txHash : undefined,
        };
      })
    );
  }
}

export const mintsProcessJob = new MintsProcessJob();
