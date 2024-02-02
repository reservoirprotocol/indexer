import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { idb } from "@/common/db";

export type ResyncAttributeCountsJobPayload = {
  tokenAttributeCounter: {
    [key: string]: number;
  };
};

export default class ResyncAttributeCountsJob extends AbstractRabbitMqJobHandler {
  queueName = "update-attribute-counts-queue";
  maxRetries = 10;
  concurrency = 3;
  useSharedChannel = true;

  public async process(payload: ResyncAttributeCountsJobPayload) {
    const { tokenAttributeCounter } = payload;

    // Update the attributes token count
    const replacementParams: { [key: string]: number } = {};
    let updateCountsString = "";

    _.forEach(tokenAttributeCounter, (count, attributeId) => {
      replacementParams[`${attributeId}`] = count;
      updateCountsString += `(${attributeId}, $/${attributeId}/),`;
    });

    updateCountsString = _.trimEnd(updateCountsString, ",");

    if (updateCountsString !== "") {
      const updateQuery = `UPDATE attributes
                           SET token_count = token_count + x.countColumn
                           FROM (VALUES ${updateCountsString}) AS x(idColumn, countColumn)
                           WHERE x.idColumn = attributes.id`;

      await idb.none(updateQuery, replacementParams);
    }
  }

  public async addToQueue(params: ResyncAttributeCountsJobPayload, delay = 0) {
    await this.send({ payload: params }, delay);
  }
}

export const resyncAttributeCountsJob = new ResyncAttributeCountsJob();
