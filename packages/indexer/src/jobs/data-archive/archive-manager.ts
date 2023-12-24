/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomUUID } from "crypto";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import { add, format } from "date-fns";
import _ from "lodash";
import fs, { createReadStream, createWriteStream } from "fs";
import { createGzip } from "zlib";
import AWS from "aws-sdk";
import { logger } from "@/common/logger";
import { ArchiveInterface } from "@/jobs/data-archive/archive-classes/archive-interface";

export class ArchiveManager {
  static async fileExists(bucket: string, key: string) {
    const s3 = new AWS.S3({
      region: "us-east-1",
    });

    try {
      await s3
        .headObject({
          Bucket: bucket,
          Key: key,
        })
        .promise();
      return true;
    } catch (error: any) {
      if (error.code === "NotFound") {
        return false;
      }

      throw error;
    }
  }

  static async archive(archiveClass: ArchiveInterface, nextBatchTime: string | null = null) {
    const randomUuid = randomUUID();
    const filename = `${archiveClass.getTableName()}-${randomUuid}.json`;
    const filenameGzip = `${filename}.gz`;

    if (!nextBatchTime) {
      try {
        nextBatchTime = await archiveClass.getNextBatchStartTime();
      } catch (error) {
        logger.error(
          "database-archive",
          `Failed to get nextBatchTime for ${archiveClass.getTableName()}`
        );
        throw error;
      }
    }

    if (nextBatchTime) {
      const s3Bucket = `${config.environment}-unuevenlabs-database-backup-${getNetworkName()}`;

      const startTimeMinute = Math.trunc(_.toNumber(format(new Date(nextBatchTime), "m")) / 10);
      const startTime = format(new Date(nextBatchTime), `yyyy-MM-dd HH:${startTimeMinute}0:00`);

      const endTimeMinute = Math.trunc(
        _.toNumber(format(add(new Date(nextBatchTime), { minutes: 10 }), "m")) / 10
      );
      const endTime = format(
        add(new Date(nextBatchTime), { minutes: 10 }),
        `yyyy-MM-dd HH:${endTimeMinute}0:00`
      );

      const s3Key = `${archiveClass.getTableName()}${format(
        new Date(nextBatchTime),
        `/yyyy/MM/dd/HH-${startTimeMinute}0`
      )}.json.gz`;

      // todo remove this after backfill
      // If the file exist remove records from db and start queue agin
      if (await ArchiveManager.fileExists(s3Bucket, s3Key)) {
        logger.error("database-archive", `${s3Key} already exist in bucket ${s3Bucket}`);

        // Delete from DB
        await archiveClass.deleteFromTable(startTime, endTime);
        return;
      }

      let count;
      try {
        count = await archiveClass.generateJsonFile(filename, startTime, endTime);
      } catch (error) {
        logger.error(
          "database-archive",
          `Failed to generate JSON file ${archiveClass.getTableName()} [${startTime} to ${endTime}]`
        );
        throw error;
      }

      // If not records were found
      if (count === 0) {
        logger.info(
          "database-archive",
          `No records from ${archiveClass.getTableName()} [${startTime} to ${endTime}]`
        );

        // Delete local files
        await fs.promises.unlink(filename);

        return;
      }

      // Compress the JSON file to GZIP file
      const sourceStream = createReadStream(filename);
      const targetStream = createWriteStream(filenameGzip);

      const gzipStream = createGzip();
      await sourceStream.pipe(gzipStream).pipe(targetStream);

      await new Promise<void>((resolve) => {
        targetStream.on("finish", () => {
          resolve();
        });
      });

      // Upload the GZIP file to S3
      const gzFileContent = fs.readFileSync(filenameGzip);

      const s3 = new AWS.S3({
        region: "us-east-1",
      });

      try {
        if (await ArchiveManager.fileExists(s3Bucket, s3Key)) {
          logger.error("database-archive", `${s3Key} already exist in bucket ${s3Bucket}`);

          // Delete local files
          await fs.promises.unlink(filename);
          await fs.promises.unlink(filenameGzip);

          return;
        }

        await s3
          .putObject({
            Bucket: s3Bucket,
            Key: s3Key,
            Body: gzFileContent,
            ContentType: "gzip",
          })
          .promise();

        // Delete local files
        await fs.promises.unlink(filename);
        await fs.promises.unlink(filenameGzip);

        // Delete from DB
        await archiveClass.deleteFromTable(startTime, endTime);
      } catch (error) {
        // Delete local files
        await fs.promises.unlink(filename);
        await fs.promises.unlink(filenameGzip);

        throw error;
      }

      logger.info(
        "database-archive",
        `Archived ${count} records from ${archiveClass.getTableName()} [${startTime} to ${endTime}]`
      );
    }
  }
}
