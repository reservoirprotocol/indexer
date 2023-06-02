/* eslint-disable @typescript-eslint/no-explicit-any */

import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { idb, redb } from "@/common/db";
import _ from "lodash";
import { logger } from "@/common/logger";

export type ResyncAttributeCollectionJobPayload = {
  continuation?: string;
  cursor?: string | null;
};

export class ResyncAttributeCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "resync-attribute-collection-queue";
  maxRetries = 10;
  concurrency = 4;

  protected async process(payload: ResyncAttributeCollectionJobPayload) {
    const limit = 200;
    const updateValues = {};
    const replacementParams = {};
    let continuationFilter = "";

    if (payload.continuation != "") {
      continuationFilter = `WHERE id > ${Number(payload.continuation)}`;
    }

    const query = `SELECT id, key
                     FROM attribute_keys
                     ${continuationFilter}
                     ORDER BY id ASC
                     LIMIT ${limit}`;

    const attributeKeys = await redb.manyOrNone(query);

    if (attributeKeys) {
      for (const attributeKey of attributeKeys) {
        (updateValues as any)[attributeKey.id] = {
          id: attributeKey.id,
          key: attributeKey.key,
        };
      }

      let updateValuesString = "";

      _.forEach(attributeKeys, (data) => {
        (replacementParams as any)[`${data.id}`] = data.key;
        updateValuesString += `(${data.id}, $/${data.id}/),`;
      });

      updateValuesString = _.trimEnd(updateValuesString, ",");

      payload.cursor = null;
      if (_.size(attributeKeys) == limit) {
        const lastAttributeKey = _.last(attributeKeys);
        logger.info(
          this.queueName,
          `Updated ${_.size(updateValues)} attributes, lastAttributeKey=${JSON.stringify(
            lastAttributeKey
          )}`
        );

        payload.cursor = lastAttributeKey.id;
      }

      try {
        const updateQuery = `UPDATE attributes
                               SET key = x.keyColumn
                               FROM (VALUES ${updateValuesString}) AS x(idColumn, keyColumn)
                               WHERE x.idColumn = attributes.attribute_key_id`;

        await idb.none(updateQuery, replacementParams);
      } catch (error) {
        logger.error(this.queueName, `${error}`);
      }
    }
  }

  public async addToQueue(params: ResyncAttributeCollectionJobPayload) {
    await this.send({ payload: params });
  }
}

export const resyncAttributeCollectionJob = new ResyncAttributeCollectionJob();

resyncAttributeCollectionJob.on("onCompleted", async (message) => {
  if (message.payload.cursor) {
    await resyncAttributeCollectionJob.addToQueue({ continuation: message.payload.cursor });
  }
});
