import { edb, pgp } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { bn, toBuffer } from "@/common/utils";
import { AddressZero } from "@ethersproject/constants";
import { getNetworkSettings } from "@/config/network";
import _ from "lodash";
import { metadataIndexFetchJob } from "@/jobs/metadata-index/metadata-fetch-job";
import { Tokens } from "@/models/tokens";
import { Collections } from "@/models/collections";
import { config } from "@/config/index";

export type UpdateUserCollectionsJobPayload = {
  fromAddress?: string;
  toAddress: string;
  contract: string;
  tokenId: string;
  amount: string;
};

export default class UpdateUserCollectionsJob extends AbstractRabbitMqJobHandler {
  queueName = "user-collections";
  maxRetries = 15;
  concurrency = _.includes([56, 137], config.chainId) ? 1 : 5;
  backoff = {
    type: "exponential",
    delay: 5000,
  } as BackoffStrategy;
  disableErrorLogs = true;

  public async process(payload: UpdateUserCollectionsJobPayload) {
    const { fromAddress, toAddress, contract, tokenId, amount } = payload;
    const queries = [];

    // Try to get the collection from the token record
    let collection = await Tokens.getCollection(contract, tokenId);

    // If no collection found throw an error to trigger a retry
    if (!collection) {
      // Get the collection by token range
      collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));

      if (!collection) {
        // Try refreshing the token
        await metadataIndexFetchJob.addToQueue(
          [
            {
              kind: "single-token",
              data: {
                method: metadataIndexFetchJob.getIndexingMethod(null),
                contract,
                tokenId,
                collection: contract,
              },
              context: "update-user-collections",
            },
          ],
          true
        );

        throw new Error(`no collection found`);
      }
    }

    // Don't update transfer from zero
    if (fromAddress && fromAddress !== AddressZero) {
      queries.push(`
        INSERT INTO user_collections (owner, collection_id, contract, token_count, is_spam)
        VALUES ($/fromAddress/, $/collection/, $/contract/, $/negativeAmount/, $/isSpam/)
        ON CONFLICT (owner, collection_id)
        DO UPDATE SET token_count = user_collections.token_count - $/amount/, is_spam = $/isSpam/, updated_at = now();
      `);
    }

    // Don't update burn addresses
    if (!_.includes(getNetworkSettings().burnAddresses, toAddress)) {
      queries.push(`
        INSERT INTO user_collections (owner, collection_id, contract, token_count, is_spam)
        VALUES ($/toAddress/, $/collection/, $/contract/, $/amount/, $/isSpam/)
        ON CONFLICT (owner, collection_id)
        DO UPDATE SET token_count = user_collections.token_count + $/amount/, is_spam = $/isSpam/, updated_at = now();
      `);
    }

    if (!_.isEmpty(queries)) {
      await edb.none(pgp.helpers.concat(queries), {
        fromAddress: fromAddress ? toBuffer(fromAddress) : "",
        toAddress: toBuffer(toAddress),
        collection: collection.id,
        contract: toBuffer(contract),
        amount,
        negativeAmount: bn(0).sub(amount).toString(),
        isSpam: collection.isSpam,
      });
    }
  }

  public async addToQueue(payload: UpdateUserCollectionsJobPayload[]) {
    await this.sendBatch(
      payload.map((p) => {
        return {
          payload: p,
        };
      })
    );
  }
}

export const updateUserCollectionsJob = new UpdateUserCollectionsJob();
