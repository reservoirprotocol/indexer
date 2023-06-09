import { redb } from "@/common/db";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { acquireLock, releaseLock } from "@/common/redis";
import { toBuffer } from "@/common/utils";
import { Tokens } from "@/models/tokens";
import {
  collectionMetadataQueueJob,
  CollectionMetadataInfo,
} from "@/jobs/collection-updates/collection-metadata-queue-job";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import { config } from "@/config/index";

export type RefreshContractCollectionsMetadataQueueJobPayload = {
  contract: string;
};

export class RefreshContractCollectionsMetadataQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-contract-collections-metadata-queue";
  maxRetries = 10;
  concurrency = 1;

  protected async process(payload: RefreshContractCollectionsMetadataQueueJobPayload) {
    if (await acquireLock(this.getLockName(payload.contract), 60)) {
      const contractCollections = await redb.manyOrNone(
        `
          SELECT
            collections.id,
            collections.community,
            collections.token_id_range
          FROM collections
          WHERE collections.contract = $/contract/
        `,
        {
          contract: toBuffer(payload.contract),
        }
      );

      if (contractCollections.length) {
        const infos: CollectionMetadataInfo[] = [];

        for (const contractCollection of contractCollections) {
          const tokenId = await Tokens.getSingleToken(contractCollection.id);

          infos.push({
            contract: payload.contract,
            tokenId,
            community: contractCollection.community,
          });
        }

        await collectionMetadataQueueJob.addToQueueBulk(infos, 0, this.queueName);
      } else {
        const contractToken = await redb.oneOrNone(
          `
            SELECT
              tokens.token_id
            FROM tokens
            WHERE tokens.contract = $/contract/
            LIMIT 1
          `,
          {
            contract: toBuffer(payload.contract),
          }
        );

        if (contractToken) {
          await metadataIndexFetch.addToQueue([
            {
              kind: "single-token",
              data: {
                method: config.metadataIndexingMethod,
                contract: payload.contract,
                tokenId: contractToken.token_id,
                collection: payload.contract,
              },
            },
          ]);
        }
      }

      await releaseLock(this.getLockName(payload.contract));
    }
  }

  public getLockName(contract: string) {
    return `${this.queueName}:${contract}-lock`;
  }

  public async addToQueue(params: RefreshContractCollectionsMetadataQueueJobPayload) {
    await this.send({ payload: params });
  }
}

export const refreshContractCollectionsMetadataQueueJob =
  new RefreshContractCollectionsMetadataQueueJob();
