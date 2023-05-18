/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb, ridb } from "@/common/db";
import _ from "lodash";

export class MqJobsDataManager {
  public static async addMultipleJobData(
    queueName: string,
    data: object | object[]
  ): Promise<string[]> {
    const placeholders = { queueName };
    const values: string[] = [];

    if (!_.isArray(data)) {
      data = [data];
    }

    _.map(data, (d, index) => {
      values.push(`($/queueName/, $/d${index}:json/)`);
      (placeholders as any)[`d${index}`] = d;
    });

    const result = await idb.many(
      `
        INSERT INTO mq_jobs_data (queue_name, data)
        VALUES ${_.join(values, ",")}
        RETURNING id;
      `,
      placeholders
    );

    return _.map(result, (r) => r.id);
  }

  public static async addJobData(queueName: string, data: object[]): Promise<string> {
    if (!_.isArray(data)) {
      data = [data];
    }

    const result = await idb.one(
      `
        INSERT INTO mq_jobs_data (queue_name, data)
        VALUES ($/queueName/, $/data:json/)
        RETURNING id;
      `,
      {
        queueName,
        data,
      }
    );

    return result.id;
  }

  public static async getJobData(id: string) {
    const result = await ridb.oneOrNone(
      `
        SELECT data
        FROM mq_jobs_data
        WHERE id = $/id/;
      `,
      {
        id,
      }
    );

    return result ? result["data"] : null;
  }

  public static async deleteJobData(id: string) {
    await idb.none(
      `
        DELETE FROM mq_jobs_data
        WHERE id = $/id/;
      `,
      {
        id,
      }
    );
  }
}
