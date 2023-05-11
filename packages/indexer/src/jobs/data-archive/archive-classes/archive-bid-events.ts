/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import _ from "lodash";
import fs from "fs";
import { EOL } from "os";
import { ArchiveInterface } from "@/jobs/data-archive/archive-classes/archive-interface";

export class ArchiveBidEvents implements ArchiveInterface {
  static tableName = "bid_events";
  static maxAgeDay = 7;

  async getNextBatchStartTime() {
    // Get the first event from which the archive will start
    const firstEventQuery = `
        SELECT created_at
        FROM ${ArchiveBidEvents.tableName}
        WHERE created_at < current_date - INTERVAL '${ArchiveBidEvents.maxAgeDay} days'
        LIMIT 1
      `;

    const dbResult = await idb.oneOrNone(firstEventQuery);
    if (dbResult && dbResult.created_at) {
      return dbResult.created_at;
    }

    return null;
  }

  async continueArchive() {
    const nextBatchTime = await this.getNextBatchStartTime();
    return !_.isNull(nextBatchTime);
  }

  getTableName() {
    return ArchiveBidEvents.tableName;
  }

  getMaxAgeDay() {
    return ArchiveBidEvents.maxAgeDay;
  }

  async generateJsonFile(filename: string, startTime: string, endTime: string): Promise<number> {
    const limit = 5000;
    let continuation = "";
    let count = 0;
    let records;

    // Open stream to JSON file
    const writerStream = fs.createWriteStream(filename);

    // Get all relevant records for the given time frame
    do {
      const query = `
            SELECT *
            FROM ${ArchiveBidEvents.tableName}
            WHERE created_at >= '${startTime}'
            AND created_at < '${endTime}'
            ${continuation}
            ORDER BY created_at ASC, id ASC
            LIMIT ${limit}
          `;

      // Parse the data
      records = await idb.manyOrNone(query);
      records = records.map((r) => {
        return {
          ...r,
          contract: fromBuffer(r.contract),
          maker: fromBuffer(r.maker),
          tx_hash: r.tx_hash ? fromBuffer(r.tx_hash) : r.tx_hash,
          order_currency: r.order_currency ? fromBuffer(r.order_currency) : r.order_currency,
          created_at: new Date(r.created_at).toISOString(),
        };
      });

      // Stream to JSON file
      records.forEach((item) => {
        writerStream.write(JSON.stringify(item) + EOL);
      });

      count += _.size(records);

      continuation = `AND created_at > '${_.last(records)?.created_at}' AND id > ${
        _.last(records)?.id
      }`;
    } while (limit === _.size(records));

    // Close Stream
    writerStream.end();

    // Wait for JSON file stream to finish
    await new Promise<void>((resolve) => {
      writerStream.on("finish", () => {
        resolve();
      });
    });

    return count;
  }

  async deleteFromTable(startTime: string, endTime: string) {
    const limit = 5000;
    let deletedRowsResult;

    do {
      const deleteQuery = `
            DELETE FROM ${ArchiveBidEvents.tableName}
            WHERE id IN (
              SELECT id
              FROM ${ArchiveBidEvents.tableName}
              WHERE created_at >= '${startTime}'
              AND created_at < '${endTime}'
              LIMIT ${limit}
            )
          `;

      deletedRowsResult = await idb.result(deleteQuery);
    } while (deletedRowsResult.rowCount === limit);
  }
}
