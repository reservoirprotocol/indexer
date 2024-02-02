import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { acquireLock, redlock, releaseLock } from "@/common/redis";
import { logger } from "@/common/logger";
import { idb, redb } from "@/common/db";
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
import AWS from "aws-sdk";
import { config } from "@/config/index";
import { EOL } from "os";
import cron from "node-cron";

export type ExportDataJobPayload = {
  taskId: number;
};

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

export default class ExportDataJob extends AbstractRabbitMqJobHandler {
  queueName = "export-data-queue";
  maxRetries = 10;
  concurrency = 1;
  useSharedChannel = true;
  timeout = 120000;

  public async process(payload: ExportDataJobPayload) {
    const { taskId } = payload;
    const queryLimit = 5000;

    const timeBefore = performance.now();

    if (await acquireLock(this.getLockName(taskId), 60 * 5)) {
      let triggerNextSequence;

      try {
        const { source, cursor, sequenceNumber, targetTableName } = await this.getSequenceInfo(
          taskId
        );

        const { data, nextCursor } = await this.getDataSourceImpl(source).getSequenceData(
          cursor,
          queryLimit
        );

        if (data.length) {
          const sequenceNumberPadded = ("000000000000000" + sequenceNumber).slice(-15);

          let sequence = "";

          for (const dataRecord of data) {
            sequence += JSON.stringify(dataRecord) + EOL;
          }

          await this.uploadSequenceToS3(
            `${targetTableName}/reservoir_${sequenceNumberPadded}.json`,
            sequence
          );

          await this.setNextSequenceInfo(taskId, nextCursor);
        }

        // Trigger next sequence only if there are more results
        triggerNextSequence = data.length >= queryLimit;

        const timeElapsed = Math.floor((performance.now() - timeBefore) / 1000);

        logger.info(
          this.queueName,
          `Export finished. taskId=${taskId}, source:${source}, cursor:${JSON.stringify(
            cursor
          )}, sequenceNumber:${sequenceNumber}, nextCursor:${JSON.stringify(
            nextCursor
          )}, triggerNextSequence=${triggerNextSequence}, timeElapsed=${timeElapsed}`
        );
      } catch (error) {
        logger.error(this.queueName, `Export failed. taskId=${taskId}, error=${error}`);
      }

      await releaseLock(this.getLockName(taskId));

      if (triggerNextSequence) {
        await this.addToQueue({ taskId });
      }
    } else {
      logger.info(this.queueName, `Unable to acquire lock. taskId=${taskId}`);
    }
  }

  public getLockName(taskId: number) {
    return `${this.queueName}:${taskId}-lock`;
  }

  public async getSequenceInfo(taskId: number) {
    const query = `SELECT source,
                        cursor,
                        sequence_number AS "sequenceNumber",
                        target_table_name AS "targetTableName"
                   FROM data_export_tasks
                   WHERE id = $/taskId/`;

    return await idb.one(query, { taskId });
  }

  public async setNextSequenceInfo(taskId: number, cursor: Record<string, unknown> | null) {
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
  }

  public getDataSourceImpl(source: DataSource) {
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
  }

  public async uploadSequenceToS3(key: string, data: string) {
    const s3UploadAWSCredentials = await this.getAwsCredentials();

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
        logger.error(this.queueName, `Upload ${key} to archive failed: ${error}`);
      }
    }
  }

  public async getAwsCredentials() {
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
  }

  public async addToQueue(params: ExportDataJobPayload) {
    await this.send({ payload: params });
  }
}

export const exportDataJob = new ExportDataJob();

// BACKGROUND WORKER ONLY
if (config.doBackgroundWork) {
  cron.schedule(
    "*/5 * * * *",
    async () =>
      await redlock
        .acquire([`data-export-cron-lock`], (5 * 60 - 5) * 1000)
        .then(async () => {
          redb
            .manyOrNone(`SELECT id FROM data_export_tasks WHERE is_active = TRUE`)
            .then(async (tasks) =>
              tasks.forEach((task) => exportDataJob.addToQueue({ taskId: task.id }))
            )
            .catch(() => {
              // Skip on any errors
            });
        })
        .catch(() => {
          // Skip on any errors
        })
  );
}
