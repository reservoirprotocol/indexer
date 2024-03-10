import { ridb } from "@/common/db";
import { fromBuffer, now } from "@/common/utils";
import { config } from "@/config/index";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import cron from "node-cron";
import { acquireLock } from "@/common/redis";
import { logger } from "@/common/logger";
import { mintQueueJob } from "@/jobs/token-updates/mint-queue-job";
import _ from "lodash";

export default class FixTokensMissingCollectionJob extends AbstractRabbitMqJobHandler {
  queueName = "fix-tokens-missing-collection";
  maxRetries = 10;
  concurrency = 10;

  public async process() {
    const tokens = await ridb.manyOrNone(
      `
          SELECT contract, token_id, minted_timestamp
          FROM tokens t 
          WHERE collection_id IS NULL
          AND updated_at < now() - INTERVAL '2 minutes'
          AND updated_at > now() - INTERVAL '1 hour'
          --AND updated_at = created_at
          ORDER BY updated_at DESC
        `
    );

    if (tokens) {
      const tokensToReMint = [];
      for (const token of tokens) {
        // Check each token once in X minutes
        if (
          await acquireLock(
            `${this.queueName}-${fromBuffer(token.contract)}-${token.token_id}`,
            15 * 60
          )
        ) {
          logger.info(
            this.queueName,
            `no collection for contract ${fromBuffer(token.contract)} tokenId ${token.token_id}`
          );
          tokensToReMint.push({
            tokenId: token.token_id,
            contract: fromBuffer(token.contract),
            mintedTimestamp: token.minted_timestamp || now(),
            context: this.queueName,
          });
        }
      }

      if (!_.isEmpty(tokensToReMint)) {
        await mintQueueJob.addToQueue(tokensToReMint);
      }
    }
  }

  public async addToQueue() {
    await this.send();
  }
}

export const fixTokensMissingCollectionJob = new FixTokensMissingCollectionJob();

if (config.doBackgroundWork && !_.includes([204], config.chainId)) {
  cron.schedule("* * * * *", async () => {
    try {
      if (await acquireLock(`${fixTokensMissingCollectionJob}-lock`, 10)) {
        try {
          await fixTokensMissingCollectionJob.addToQueue();
        } catch (error) {
          logger.error(
            fixTokensMissingCollectionJob.queueName,
            `Failed to add check for tokens missing collection: ${error}`
          );
        }
      }
    } catch (error) {
      logger.error(
        fixTokensMissingCollectionJob.queueName,
        JSON.stringify({
          msg: error,
        })
      );
    }
  });
}
