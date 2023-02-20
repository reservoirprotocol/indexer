import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { randomUUID } from "crypto";
import { EOL } from "os";
import AWS from "aws-sdk";

import { AskEventsDataSource } from "@/jobs/data-export/data-sources/ask-events";
import { BidEventsDataSource } from "@/jobs/data-export/data-sources/bid-events";
import { TokenFloorAskEventsDataSource } from "@/jobs/data-export/data-sources/token-floor-ask-events";
import { CollectionFloorAskEventsDataSource } from "@/jobs/data-export/data-sources/collection-floor-ask-events";
import { CollectionTopBidEventsDataSource } from "@/jobs/data-export/data-sources/collection_top_bid_events";
import { AsksDataSource, AsksDataSourceV2 } from "@/jobs/data-export/data-sources/asks";
import { BidsDataSource } from "@/jobs/data-export/data-sources/bids";
import { TokensDataSource, TokensDataSourceV2 } from "@/jobs/data-export/data-sources/tokens";
import {
  CollectionsDataSource,
  CollectionsDataSourcev2,
} from "@/jobs/data-export/data-sources/collections";
import { SalesDataSourceV2 } from "@/jobs/data-export/data-sources/sales";
import {
  AttributeKeysDataSource,
  AttributeKeysDataSourceV2,
} from "@/jobs/data-export/data-sources/attribute-keys";
import {
  AttributesDataSource,
  AttributesDataSourceV2,
} from "@/jobs/data-export/data-sources/attributes";
import {
  TokenAttributesDataSource,
  TokenAttributesDataSourceV2,
} from "@/jobs/data-export/data-sources/token-attributes";

const QUEUE_NAME = "export-data-queue";
const QUERY_LIMIT = 5000;

export const queue = new Queue(QUEUE_NAME, {
  connection: redis.duplicate(),
  defaultJobOptions: {
    attempts: 10,
    removeOnComplete: true,
    removeOnFail: 100,
    timeout: 120000,
  },
});
new QueueScheduler(QUEUE_NAME, { connection: redis.duplicate() });

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { taskId } = job.data;

      const timeBefore = performance.now();

      if (await acquireLock(getLockName(taskId), 60 * 5)) {
        let triggerNextSequence;

        try {
          const { source, cursor, sequenceNumber, targetTableName } = await getSequenceInfo(taskId);

          const { data, nextCursor } = await getDataSourceImpl(source).getSequenceData(
            cursor,
            QUERY_LIMIT
          );

          if (data.length) {
            const sequenceNumberPadded = ("000000000000000" + sequenceNumber).slice(-15);

            let sequence = "";

            for (const dataRecord of data) {
              sequence += JSON.stringify(dataRecord) + EOL;
            }

            await uploadSequenceToS3(
              `${targetTableName}/reservoir_${sequenceNumberPadded}.json`,
              sequence
            );

            await setNextSequenceInfo(taskId, nextCursor);
          }

          // Trigger next sequence only if there are more results
          triggerNextSequence = data.length >= QUERY_LIMIT;

          const timeElapsed = Math.floor((performance.now() - timeBefore) / 1000);

          logger.info(
            QUEUE_NAME,
            `Export finished. taskId=${taskId}, source:${source}, cursor:${JSON.stringify(
              cursor
            )}, sequenceNumber:${sequenceNumber}, nextCursor:${JSON.stringify(
              nextCursor
            )}, triggerNextSequence=${triggerNextSequence}, timeElapsed=${timeElapsed}`
          );
        } catch (error) {
          logger.error(QUEUE_NAME, `Export failed. taskId=${taskId}, error=${error}`);
        }

        await releaseLock(getLockName(taskId));

        if (triggerNextSequence) {
          await addToQueue(taskId);
        }
      } else {
        logger.info(QUEUE_NAME, `Unable to acquire lock. taskId=${taskId}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 11 }
  );

  worker.on("failed", async (job) => {
    logger.error(QUEUE_NAME, `Worker failed: ${JSON.stringify(job)}`);
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export enum DataSource {
  askEvents = "ask-events",
  bidEvents = "bid-events",
  tokenFloorAskEvents = "token-floor-ask-events",
  collectionFloorAskEvents = "collection-floor-ask-events",
  collectionTopBidEvents = "collection-top-bid-events",
  asks = "asks",
  asksV2 = "asks-v2",
  bids = "bids",
  tokens = "tokens",
  tokensV2 = "tokens-v2",
  collections = "collections",
  collectionsV2 = "collections-v2",
  salesV2 = "sales-v2",
  attributeKeys = "attribute-keys",
  attributeKeysV2 = "attribute-keys-v2",
  attributes = "attributes",
  attributesV2 = "attributes-v2",
  tokenAttributes = "token-attributes",
  tokenAttributesV2 = "token-attributes-v2",
}

export const getLockName = (taskId: number) => {
  return `${QUEUE_NAME}:${taskId}-lock`;
};

export const addToQueue = async (taskId: number) => {
  await queue.add(randomUUID(), { taskId });
};

const getSequenceInfo = async (taskId: number) => {
  const query = `SELECT source,
                        cursor,
                        sequence_number AS "sequenceNumber",
                        target_table_name AS "targetTableName"
                   FROM data_export_tasks
                   WHERE id = $/taskId/`;

  return await idb.one(query, { taskId });
};

const setNextSequenceInfo = async (taskId: number, cursor: Record<string, unknown> | null) => {
  const query = `
          UPDATE data_export_tasks
          SET cursor = $/cursor/,
              sequence_number = sequence_number + 1,
              updated_at = now()
          WHERE id = $/taskId/
        `;

  await idb.none(query, {
    taskId,
    cursor,
  });
};

const getDataSourceImpl = (source: DataSource) => {
  switch (source) {
    case DataSource.askEvents:
      return new AskEventsDataSource();
    case DataSource.bidEvents:
      return new BidEventsDataSource();
    case DataSource.tokenFloorAskEvents:
      return new TokenFloorAskEventsDataSource();
    case DataSource.collectionFloorAskEvents:
      return new CollectionFloorAskEventsDataSource();
    case DataSource.collectionTopBidEvents:
      return new CollectionTopBidEventsDataSource();
    case DataSource.asks:
      return new AsksDataSource();
    case DataSource.asksV2:
      return new AsksDataSourceV2();
    case DataSource.bids:
      return new BidsDataSource();
    case DataSource.tokens:
      return new TokensDataSource();
    case DataSource.tokensV2:
      return new TokensDataSourceV2();
    case DataSource.collections:
      return new CollectionsDataSource();
    case DataSource.collectionsV2:
      return new CollectionsDataSourcev2();
    case DataSource.salesV2:
      return new SalesDataSourceV2();
    case DataSource.attributeKeys:
      return new AttributeKeysDataSource();
    case DataSource.attributeKeysV2:
      return new AttributeKeysDataSourceV2();
    case DataSource.attributes:
      return new AttributesDataSource();
    case DataSource.attributesV2:
      return new AttributesDataSourceV2();
    case DataSource.tokenAttributes:
      return new TokenAttributesDataSource();
    case DataSource.tokenAttributesV2:
      return new TokenAttributesDataSourceV2();
  }

  throw new Error(`Unsupported data source`);
};

const uploadSequenceToS3 = async (key: string, data: string) => {
  const s3UploadAWSCredentials = await getAwsCredentials();

  await new AWS.S3(s3UploadAWSCredentials)
    .putObject({
      Bucket: config.dataExportS3BucketName,
      Key: key,
      Body: data,
      ContentType: "application/json",
      ACL: "bucket-owner-full-control",
    })
    .promise();

  if (config.dataExportS3ArchiveBucketName) {
    try {
      await new AWS.S3({
        accessKeyId: config.awsAccessKeyId,
        secretAccessKey: config.awsSecretAccessKey,
      })
        .putObject({
          Bucket: config.dataExportS3ArchiveBucketName,
          Key: key,
          Body: data,
          ContentType: "application/json",
        })
        .promise();
    } catch (error) {
      logger.error(QUEUE_NAME, `Upload ${key} to archive failed: ${error}`);
    }
  }
};

const getAwsCredentials = async () => {
  let sts = new AWS.STS({
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  });

  const accessRole = await sts
    .assumeRole({
      RoleArn: config.dataExportAwsAccessRole,
      RoleSessionName: "AssumeRoleSession",
    })
    .promise();

  sts = new AWS.STS({
    accessKeyId: accessRole?.Credentials?.AccessKeyId,
    secretAccessKey: accessRole?.Credentials?.SecretAccessKey,
    sessionToken: accessRole?.Credentials?.SessionToken,
  });

  const uploadRole = await sts
    .assumeRole({
      RoleArn: config.dataExportAwsS3UploadRole,
      RoleSessionName: "UploadRoleSession",
      ExternalId: config.dataExportAwsS3UploadExternalId,
    })
    .promise();

  return {
    accessKeyId: uploadRole?.Credentials?.AccessKeyId,
    secretAccessKey: uploadRole?.Credentials?.SecretAccessKey,
    sessionToken: uploadRole?.Credentials?.SessionToken,
  };
};
