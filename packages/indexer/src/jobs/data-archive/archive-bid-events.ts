/* eslint-disable @typescript-eslint/no-explicit-any */

import { randomUUID } from "crypto";
import { idb } from "@/common/db";
import { config } from "@/config/index";
import { getNetworkName } from "@/config/network";
import { add, format } from "date-fns";
import { fromBuffer } from "@/common/utils";
import _ from "lodash";
import fs, { createReadStream, createWriteStream } from "fs";
import { createGzip } from "zlib";
import AWS from "aws-sdk";
import { logger } from "@/common/logger";

export class ArchiveBidEvents {
  static tableName = "bid_events";
  static maxAgeDay = 30;

  static async getFirstEvent() {
    // Get the first event from which the archive will start
    const firstEventQuery = `
        SELECT created_at
        FROM ${ArchiveBidEvents.tableName}
        WHERE created_at < current_date - INTERVAL '${ArchiveBidEvents.maxAgeDay} days'
        ORDER BY created_at ASC
        LIMIT 1
      `;

    return await idb.oneOrNone(firstEventQuery);
  }

  static async continueArchive() {
    const event = await ArchiveBidEvents.getFirstEvent();
    return !_.isEmpty(event);
  }

  static async archive() {
    const limit = 5000;
    let events;

    const randomUuid = randomUUID();
    const filename = `${ArchiveBidEvents.tableName}-${randomUuid}.json`;
    const filenameGzip = `${ArchiveBidEvents.tableName}-${randomUuid}.gz`;

    const event = await ArchiveBidEvents.getFirstEvent();

    if (event) {
      const s3Bucket = `${
        config.chainId === 5 ? "dev" : "prod"
      }-unuevenlabs-database-backup-${getNetworkName()}`;
      const s3Key = `${ArchiveBidEvents.tableName}${format(
        new Date(event.created_at),
        `/yyyy/MM/dd/HH-00`
      )}.gz`;
      const startTime = format(new Date(event.created_at), "yyyy-MM-dd HH:00:00");
      const endTime = format(add(new Date(event.created_at), { hours: 1 }), "yyyy-MM-dd HH:00:00");
      let jsonEvents: any[] = [];
      let continuation = "";
      let count = 0;

      // Get all relevant events for the given time frame
      do {
        const query = `
            SELECT *
            FROM ${ArchiveBidEvents.tableName}
            WHERE created_at < current_date - INTERVAL '${ArchiveBidEvents.maxAgeDay} days'
            AND created_at >= '${startTime}'
            AND created_at < '${endTime}'
            ${continuation}
            ORDER BY created_at ASC, id ASC
            LIMIT ${limit}
          `;

        // Parse the data
        events = await idb.manyOrNone(query);
        events = events.map((r) => {
          return {
            ...r,
            contract: fromBuffer(r.contract),
            maker: fromBuffer(r.maker),
            tx_hash: r.tx_hash ? fromBuffer(r.tx_hash) : r.tx_hash,
            order_currency: r.order_currency ? fromBuffer(r.order_currency) : r.order_currency,
            created_at: new Date(r.created_at).toISOString(),
          };
        });

        count += _.size(events);

        // Construct the JSON object
        jsonEvents = jsonEvents.concat(JSON.parse(JSON.stringify(events)));
        continuation = `AND created_at > '${_.last(events).created_at}' AND id > ${
          _.last(events).id
        }`;
      } while (limit === _.size(events));

      // Write to JSON file
      await fs.promises.writeFile(filename, JSON.stringify(jsonEvents));

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

      // Update the GZIP file to S3
      const gzFileContent = fs.readFileSync(filenameGzip);

      const s3 = new AWS.S3({
        region: "us-east-1",
      });

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
      let deletedRowsResult;
      do {
        const deleteQuery = `
            DELETE FROM ${ArchiveBidEvents.tableName}
            WHERE id IN (
              SELECT id
              FROM ${ArchiveBidEvents.tableName}
              WHERE created_at < current_date - INTERVAL '${ArchiveBidEvents.maxAgeDay} days'
              AND created_at >= '${startTime}'
              AND created_at < '${endTime}'
              LIMIT ${limit}
            )
          `;

        deletedRowsResult = await idb.result(deleteQuery);
      } while (deletedRowsResult.rowCount === limit);

      logger.info(
        "archive-bid-events",
        `Archived ${count} records from ${ArchiveBidEvents.tableName} [${startTime} to ${endTime}]`
      );
    }
  }
}
