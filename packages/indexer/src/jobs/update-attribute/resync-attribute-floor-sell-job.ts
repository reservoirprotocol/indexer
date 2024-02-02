import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { redb } from "@/common/db";
import _ from "lodash";
import { resyncAttributeCacheJob } from "@/jobs/update-attribute/resync-attribute-cache-job";
import { fromBuffer } from "@/common/utils";

export type ResyncAttributeFloorSellJobPayload = {
  continuation?: string;
};

export default class ResyncAttributeFloorSellJob extends AbstractRabbitMqJobHandler {
  queueName = "resync-attribute-floor-value-queue";
  maxRetries = 10;
  concurrency = 4;
  useSharedChannel = true;

  public async process(payload: ResyncAttributeFloorSellJobPayload) {
    const { continuation } = payload;
    const limit = 500;
    let continuationFilter = "";

    if (continuation != "") {
      continuationFilter = `WHERE id > '${continuation}'`;
    }

    const query = `
      SELECT id
      FROM collections
      ${continuationFilter}
      ORDER BY id ASC
      LIMIT ${limit}
    `;

    const collections = await redb.manyOrNone(query);

    if (collections) {
      const collectionsIds = _.join(
        _.map(collections, (collection) => collection.id),
        "','"
      );

      const tokensQuery = `
            SELECT DISTINCT ON (key, value) key, value, tokens.contract, tokens.token_id
            FROM collections
            JOIN tokens ON collections.contract = tokens.contract
            JOIN token_attributes ON tokens.contract = token_attributes.contract AND token_attributes.token_id = tokens.token_id
            WHERE collections.id IN ('$/collectionsIds:raw/')
            AND tokens.floor_sell_value IS NOT NULL
        `;

      const tokens = await redb.manyOrNone(tokensQuery, { collectionsIds });

      _.forEach(tokens, (token) => {
        resyncAttributeCacheJob.addToQueue(
          { contract: fromBuffer(token.contract), tokenId: token.token_id },
          0
        );
      });

      if (_.size(collections) == limit) {
        const lastCollection = _.last(collections);
        await this.addToQueue({ continuation: lastCollection.id });
      }
    }
  }

  public async addToQueue(params: ResyncAttributeFloorSellJobPayload) {
    await this.send({ payload: params });
  }
}

export const resyncAttributeFloorSellJob = new ResyncAttributeFloorSellJob();
