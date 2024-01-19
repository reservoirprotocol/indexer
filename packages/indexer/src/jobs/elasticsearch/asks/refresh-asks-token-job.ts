import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { config } from "@/config/index";
import * as AsksIndex from "@/elasticsearch/indexes/asks";
import _ from "lodash";
import { Tokens } from "@/models/tokens";
import crypto from "crypto";
import { RabbitMQMessage } from "@/common/rabbit-mq";
import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { logger } from "@/common/logger";

export type RefreshAsksTokenJobPayload = {
  contract: string;
  tokenId: string;
  refreshAttributes?: boolean;
};

export default class RefreshAsksTokenJob extends AbstractRabbitMqJobHandler {
  queueName = "refresh-asks-token-queue";
  maxRetries = 10;
  concurrency = 2;
  persistent = true;
  lazyMode = true;

  protected async process(payload: RefreshAsksTokenJobPayload) {
    let addToQueue = false;

    const { contract, tokenId, refreshAttributes } = payload;

    const tokenData = await Tokens.getByContractAndTokenId(contract, tokenId);

    if (!_.isEmpty(tokenData)) {
      let tokenAttributes;

      if (refreshAttributes) {
        tokenAttributes = await idb.manyOrNone(
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
      }

      logger.info(
        this.queueName,
        `Refreshing attributes. contract=${contract}, tokenId=${tokenId}, tokenAttributes=${JSON.stringify(
          tokenAttributes
        )}`
      );

      const keepGoing = await AsksIndex.updateAsksTokenData(contract, tokenId, {
        isFlagged: tokenData.isFlagged,
        isSpam: tokenData.isSpam,
        nsfwStatus: tokenData.nsfwStatus,
        rarityRank: tokenData.rarityRank,
        attributes: tokenAttributes,
      });

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

  public async addToQueue(contract: string, tokenId: string, refreshAttributes = false) {
    if (!config.doElasticsearchWork) {
      return;
    }

    const jobId = crypto
      .createHash("sha256")
      .update(`${contract.toLowerCase()}:${tokenId}:${refreshAttributes}`)
      .digest("hex");

    await this.send({ payload: { contract, tokenId, refreshAttributes }, jobId });
  }
}

export const refreshAsksTokenJob = new RefreshAsksTokenJob();
