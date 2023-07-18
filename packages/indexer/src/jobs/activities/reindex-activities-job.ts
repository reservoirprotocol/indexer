import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as ActivitiesIndex from "@/elasticsearch/indexes/activities";
import { elasticsearch } from "@/common/elasticsearch";
import { logger } from "@/common/logger";
import { MappingTypeMapping } from "@elastic/elasticsearch/lib/api/types";
import { monitorReindexActivitiesJob } from "@/jobs/activities/monitor-reindex-activities-job";

const MAPPINGS: MappingTypeMapping = {
  dynamic: "false",
  properties: {
    id: { type: "keyword" },
    createdAt: { type: "date" },
    indexedAt: { type: "date" },
    type: { type: "keyword" },
    timestamp: { type: "date", format: "epoch_second" },
    contract: { type: "keyword" },
    fromAddress: { type: "keyword" },
    toAddress: { type: "keyword" },
    amount: { type: "keyword" },
    token: {
      properties: {
        id: { type: "keyword" },
        name: { type: "keyword" },
        image: { type: "keyword" },
        media: { type: "keyword" },
      },
    },
    collection: {
      properties: {
        id: { type: "keyword" },
        name: { type: "keyword" },
        image: { type: "keyword" },
      },
    },
    order: {
      properties: {
        id: { type: "keyword" },
        side: { type: "keyword" },
        sourceId: { type: "integer" },
        criteria: {
          properties: {
            kind: { type: "keyword" },
            data: {
              properties: {
                token: {
                  properties: {
                    tokenId: { type: "keyword" },
                  },
                },
                collection: {
                  properties: {
                    id: { type: "keyword" },
                  },
                },
                attribute: {
                  properties: {
                    key: { type: "keyword" },
                    value: { type: "keyword" },
                  },
                },
              },
            },
          },
        },
      },
    },
    event: {
      properties: {
        timestamp: { type: "float" },
        txHash: { type: "keyword" },
        logIndex: { type: "integer" },
        batchIndex: { type: "integer" },
        blockHash: { type: "keyword" },
      },
    },
    pricing: {
      properties: {
        price: { type: "keyword" },
        priceDecimal: { type: "double" },
        currencyPrice: { type: "keyword" },
        usdPrice: { type: "keyword" },
        feeBps: { type: "integer" },
        currency: { type: "keyword" },
        value: { type: "keyword" },
        valueDecimal: { type: "double" },
        currencyValue: { type: "keyword" },
        normalizedValue: { type: "keyword" },
        normalizedValueDecimal: { type: "double" },
        currencyNormalizedValue: { type: "keyword" },
      },
    },
  },
};

export type ReindexActivitiesJobPayload = {
  indexName: string;
  numberOfShards: number;
};

export class ReindexActivitiesJob extends AbstractRabbitMqJobHandler {
  queueName = "reindex-activities-queue";
  maxRetries = 10;
  concurrency = 1;
  persistent = true;
  lazyMode = true;
  useSharedChannel = true;

  protected async process(payload: ReindexActivitiesJobPayload) {
    const params = {
      index: `${ActivitiesIndex.getIndexName()}-${Date.now()}`,
      mappings: MAPPINGS,
      settings: {
        number_of_shards: payload.numberOfShards,
        sort: {
          field: ["timestamp"],
          order: ["desc"],
        },
      },
    };

    const createIndexResponse = await elasticsearch.indices.create(params);

    logger.info(
      this.queueName,
      JSON.stringify({
        message: "Index Created!",
        indexName: ActivitiesIndex.getIndexName(),
        params,
        createIndexResponse,
      })
    );

    const reindexResult = await elasticsearch.reindex({
      source: { index: ActivitiesIndex.getIndexName() },
      dest: { index: params.index },
      wait_for_completion: false,
    });

    if (reindexResult) {
      logger.info(
        this.queueName,
        JSON.stringify({
          message: `Task Created! taskId=${reindexResult.task}`,
          reindexResult,
        })
      );

      await monitorReindexActivitiesJob.addToQueue(reindexResult.task!.toString());
    }
  }

  public async addToQueue(indexName: string, numberOfShards: number) {
    if (!config.doElasticsearchWork) {
      return;
    }

    await this.send({ payload: { indexName, numberOfShards } });
  }
}

export const reindexActivitiesJob = new ReindexActivitiesJob();
