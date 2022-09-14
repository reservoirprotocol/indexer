import { Job, Queue, QueueScheduler, Worker } from "bullmq";

import { logger } from "@/common/logger";
import { acquireLock, redis, releaseLock } from "@/common/redis";
import { config } from "@/config/index";
import { idb } from "@/common/db";
import { randomUUID } from "crypto";
import { EOL } from "os";
import AWS from "aws-sdk";

import { AskEventsDataSource } from "@/jobs/data-export/data-sources/ask-events";
import { TokenFloorAskEventsDataSource } from "@/jobs/data-export/data-sources/token-floor-ask-events";
import { CollectionFloorAskEventsDataSource } from "@/jobs/data-export/data-sources/collection-floor-ask-events";
import { AsksDataSource } from "@/jobs/data-export/data-sources/asks";
import { TokensDataSource } from "@/jobs/data-export/data-sources/tokens";
import { CollectionsDataSource } from "@/jobs/data-export/data-sources/collections";
import { SalesDataSource } from "@/jobs/data-export/data-sources/sales";
import { AttributeKeysDataSource } from "@/jobs/data-export/data-sources/attribute-keys";
import { AttributesDataSource } from "@/jobs/data-export/data-sources/attributes";
import { TokenAttributesDataSource } from "@/jobs/data-export/data-sources/token-attributes";

const QUEUE_NAME = "export-data-queue";
const QUERY_LIMIT = 1000;

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
      const { kind } = job.data;

      if (await acquireLock(getLockName(kind), 60 * 5)) {
        try {
          const { cursor, sequenceNumber } = await getSequenceInfo(kind);
          const { data, nextCursor } = await getDataSource(kind).getSequenceData(
            cursor,
            QUERY_LIMIT
          );

          if (data.length) {
            const sequenceNumberPadded = ("000000000000000" + sequenceNumber).slice(-15);
            const targetName = kind.replace(/-/g, "_");

            let sequence = "";

            for (const dataRecord of data) {
              sequence += JSON.stringify(dataRecord) + EOL;
            }

            await uploadSequenceToS3(
              `${targetName}/reservoir_${sequenceNumberPadded}.json`,
              sequence
            );
            await setNextSequenceInfo(kind, nextCursor);
          }

          // Trigger next sequence only if there are more results
          job.data.addToQueue = data.length >= QUERY_LIMIT;

          logger.info(
            QUEUE_NAME,
            `Export finished. kind:${kind}, cursor:${JSON.stringify(
              cursor
            )}, sequenceNumber:${sequenceNumber}, nextCursor:${JSON.stringify(nextCursor)}`
          );
        } catch (error) {
          logger.error(QUEUE_NAME, `Export ${kind} failed: ${error}`);
        }

        await releaseLock(getLockName(kind));
      } else {
        logger.info(QUEUE_NAME, `Unable to acquire lock: ${kind}`);
      }
    },
    { connection: redis.duplicate(), concurrency: 15 }
  );

  worker.on("completed", async (job) => {
    if (job.data.addToQueue) {
      await addToQueue(job.data.kind);
    }
  });

  worker.on("failed", async (job) => {
    logger.error(QUEUE_NAME, `Worker failed: ${JSON.stringify(job)}`);
  });

  worker.on("error", (error) => {
    logger.error(QUEUE_NAME, `Worker errored: ${error}`);
  });
}

export enum DataSourceKind {
  askEvents = "ask-events",
  tokenFloorAskEvents = "token-floor-ask-events",
  collectionFloorAskEvents = "collection-floor-ask-events",
  asks = "asks",
  tokens = "tokens",
  collections = "collections",
  sales = "sales",
  attributeKeys = "attribute-keys",
  attributes = "attributes",
  tokenAttributes = "token-attributes",
}

export const getLockName = (kind: DataSourceKind) => {
  return `${QUEUE_NAME}:${kind}-lock`;
};

export const addToQueue = async (kind: DataSourceKind) => {
  await queue.add(randomUUID(), { kind });
};

const getSequenceInfo = async (kind: DataSourceKind) => {
  const query = `SELECT cursor,
                        sequence_number AS "sequenceNumber"
                   FROM data_export_tasks
                   WHERE source = $/kind/`;

  return await idb.one(query, {
    kind,
  });
};

const setNextSequenceInfo = async (
  kind: DataSourceKind,
  cursor: Record<string, unknown> | null
) => {
  const query = `
          UPDATE data_export_tasks
          SET cursor = $/cursor/,
              sequence_number = sequence_number + 1,
              updated_at = now()
          WHERE source = $/kind/
        `;

  await idb.none(query, {
    kind,
    cursor,
  });
};

const getDataSource = (kind: DataSourceKind) => {
  switch (kind) {
    case DataSourceKind.askEvents:
      return new AskEventsDataSource();
    case DataSourceKind.tokenFloorAskEvents:
      return new TokenFloorAskEventsDataSource();
    case DataSourceKind.collectionFloorAskEvents:
      return new CollectionFloorAskEventsDataSource();
    case DataSourceKind.asks:
      return new AsksDataSource();
    case DataSourceKind.tokens:
      return new TokensDataSource();
    case DataSourceKind.collections:
      return new CollectionsDataSource();
    case DataSourceKind.sales:
      return new SalesDataSource();
    case DataSourceKind.attributeKeys:
      return new AttributeKeysDataSource();
    case DataSourceKind.attributes:
      return new AttributesDataSource();
    case DataSourceKind.tokenAttributes:
      return new TokenAttributesDataSource();
  }

  throw new Error(`Unsupported data source ${kind}`);
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
