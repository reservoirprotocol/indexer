/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb } from "@/common/db";
import { fromBuffer } from "@/common/utils";
import _ from "lodash";
import fs from "fs";
import { EOL } from "os";
import { ArchiveInterface } from "@/jobs/data-archive/archive-classes/archive-interface";

export class ArchiveBidOrders implements ArchiveInterface {
  static tableName = "orders";
  static maxAgeDay = 7;

  async getNextBatchStartTime() {
    // Get the first order from which the archive will start
    const firstEventQuery = `
        SELECT updated_at
        FROM ${ArchiveBidOrders.tableName}
        WHERE updated_at < current_date - INTERVAL '${ArchiveBidOrders.maxAgeDay} days'
        AND side = 'buy'
        AND fillability_status = 'expired'
        ORDER BY updated_at DESC, id ASC
        LIMIT 1
      `;

    const dbResult = await idb.oneOrNone(firstEventQuery);
    if (dbResult && dbResult.updated_at) {
      return dbResult.updated_at;
    }

    return null;
  }

  async continueArchive() {
    const nextBatchTime = await this.getNextBatchStartTime();
    return !_.isNull(nextBatchTime);
  }

  getTableName() {
    return ArchiveBidOrders.tableName;
  }

  getMaxAgeDay() {
    return ArchiveBidOrders.maxAgeDay;
  }

  async generateJsonFile(filename: string, startTime: string, endTime: string) {
    const limit = 5000;
    let continuation = "";
    let continuationValues: { updatedAt: number; id: string } = { updatedAt: 0, id: "" };
    let count = 0;
    let records;

    // Open stream to JSON file
    const writerStream = fs.createWriteStream(filename);

    // Get all relevant records for the given time frame
    do {
      const query = `
            SELECT *, extract(epoch from updated_at) AS updated_at_cont
            FROM ${ArchiveBidOrders.tableName}
            WHERE updated_at >= $/startTime/
            AND updated_at < $/endTime/
            AND side = 'buy'
            AND fillability_status = 'expired'
            ${continuation}
            ORDER BY updated_at ASC, id ASC
            LIMIT ${limit}
          `;

      // Parse the data
      records = await idb.manyOrNone(query, {
        startTime,
        endTime,
        updateAt: continuationValues.updatedAt,
        id: continuationValues.id,
      });

      records = records.map((r) => {
        return {
          ...r,
          token_set_schema_hash: r.token_set_schema_hash
            ? fromBuffer(r.token_set_schema_hash)
            : r.token_set_schema_hash,
          maker: r.maker ? fromBuffer(r.maker) : r.maker,
          taker: r.taker ? fromBuffer(r.taker) : r.taker,
          contract: r.contract ? fromBuffer(r.contract) : r.contract,
          conduit: r.conduit ? fromBuffer(r.conduit) : r.conduit,
          currency: r.currency ? fromBuffer(r.currency) : r.currency,
          updated_at: new Date(r.updated_at).toISOString(),
          created_at: new Date(r.created_at).toISOString(),
        };
      });

      // Stream to JSON file
      records.forEach((item) => {
        writerStream.write(JSON.stringify(item) + EOL);
      });

      count += _.size(records);

      continuationValues = { updatedAt: _.last(records)?.updated_at_cont, id: _.last(records)?.id };
      continuation = `AND (updated_at, id) > (to_timestamp($/updateAt/), $/id/)`;
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
            DELETE FROM ${ArchiveBidOrders.tableName}
            WHERE id IN (
              SELECT id
              FROM ${ArchiveBidOrders.tableName}
              WHERE updated_at >= '${startTime}'
              AND updated_at < '${endTime}'
              AND side = 'buy'
              AND fillability_status = 'expired'
              LIMIT ${limit}
            )
          `;

      deletedRowsResult = await idb.result(deleteQuery);
    } while (deletedRowsResult.rowCount === limit);
  }
}
