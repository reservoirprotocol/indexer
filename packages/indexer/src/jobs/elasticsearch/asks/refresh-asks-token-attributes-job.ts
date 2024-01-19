import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as AsksIndex from "@/elasticsearch/indexes/asks";
import _ from "lodash";
import crypto from "crypto";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { logger } from "@/common/logger";

export type RefreshAsksTokenAttributesJobPayload = {
  contract: string;
  tokenId: string;
};

export default class RefreshAsksTokenAttributesJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-asks-token-attributes-queue";
  maxRetries = 10;
  concurrency = 2;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshAsksTokenAttributesJobPayload) {
    let addToQueue = false;

    const { contract, tokenId } = payload;

    const tokenAttributesData = await idb.manyOrNone(
      `
            SELECT 
              ta.key, 
              ta.value 
            FROM 
              token_attributes ta 
            WHERE 
              ta.contract = $/contract/ 
              AND ta.token_id = $/tokenId/ 
              AND ta.key != ''
            `,
      {
        contract: toBuffer(contract),
        tokenId,
      }
    );

    if (!_.isEmpty(tokenAttributesData)) {
      logger.info(
        this.queueName,
        `Refreshing attributes. contract=${contract}, tokenId=${tokenId}, tokenAttributesData=${JSON.stringify(
          tokenAttributesData
        )}`
      );

      const keepGoing = await AsksIndex.updateAsksTokenAttributesData(
        contract,
        tokenId,
        tokenAttributesData
      );

      if (keepGoing) {
        addToQueue = true;
      }
    }

    return { addToQueue };
  }

  public async onCompleted(message: RabbitMQMessage, processResult: { addToQueue: boolean }) {
    if (processResult.addToQueue) {
      await this.addToQueue(message.payload.contract, message.payload.tokenId);
    }
  }

  public async addToQueue(contract: string, tokenId: string) {
    if (!config.doElasticsearchWork) {
      return;
    }

    const jobId = crypto
      .createHash("sha256")
      .update(`${contract.toLowerCase()}:${tokenId}`)
      .digest("hex");

    await this.send({ payload: { contract, tokenId }, jobId });
  }
}

export const refreshAsksTokenAttributesJob = new RefreshAsksTokenAttributesJob();
