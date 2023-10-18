import { redb } from "@/common/db";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { toBuffer } from "@/common/utils";
import {
  collectionMetadataQueueJob,
  CollectionMetadataInfo,
} from "@/jobs/collection-updates/collection-metadata-queue-job";
import { config } from "@/config/index";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";

export type RefreshContractCollectionsMetadataQueueJobPayload = {
  contract: string;
};

export default class RefreshContractCollectionsMetadataQueueJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-contract-collections-metadata-queue";
  maxRetries = 10;
  concurrency = 1;
  useSharedChannel = true;

  protected async process(payload: RefreshContractCollectionsMetadataQueueJobPayload) {
    const { contract } = payload;

    const contractCollections = await redb.manyOrNone(
      `
          SELECT
            collections.community,
            t.token_id
          FROM collections
          JOIN LATERAL (
                    SELECT t.token_id
                    FROM tokens t
                    WHERE t.collection_id = collections.id
                    LIMIT 1
                ) t ON TRUE
          WHERE collections.contract = $/contract/
          LIMIT 1000
      `,
      {
        contract: toBuffer(contract),
      }
    );

    if (contractCollections.length) {
      const infos: CollectionMetadataInfo[] = contractCollections.map((contractCollection) => ({
        contract,
        tokenId: contractCollection.token_id,
        community: contractCollection.community,
      }));

      await collectionMetadataQueueJob.addToQueueBulk(infos);
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
          contract: toBuffer(contract),
        }
      );

      if (contractToken) {
        await metadataIndexFetchJob.addToQueue([
          {
            kind: "single-token",
            data: {
              method: config.metadataIndexingMethod,
              contract: contract,
              tokenId: contractToken.token_id,
              collection: contract,
            },
            context: this.queueName,
          },
        ]);
      }
    }
  }

  public async addToQueue(params: RefreshContractCollectionsMetadataQueueJobPayload) {
    await this.send({ payload: params, jobId: params.contract });
  }
}

export const refreshContractCollectionsMetadataQueueJob =
  new RefreshContractCollectionsMetadataQueueJob();
