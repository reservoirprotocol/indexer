/* eslint-disable @typescript-eslint/no-explicit-any */

import { idb, pgp, redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { Collections } from "@/models/collections";

export type BurnedTokenJobPayload = {
  contract: string;
  tokenId: string;
};

export default class BurnedTokenJob extends AbstractRabbitMqJobHandler {
  queueName = "burned-token";
  maxRetries = 0;
  concurrency = 10;

  public async process(payload: BurnedTokenJobPayload) {
    const { contract, tokenId } = payload;
    const queries = [];

    const contractKind = await redb.oneOrNone(
      `SELECT kind FROM contracts WHERE address = $/address/`,
      { address: toBuffer(contract) }
    );

    // Process only erc721
    if (contractKind && contractKind.kind === "erc721") {
      const collection = await Collections.getByContractAndTokenId(contract, Number(tokenId));

      if (collection) {
        queries.push(`
          UPDATE collections SET
            token_count = GREATEST(token_count - 1, 0),
            updated_at = now()
          WHERE id = $/collection/
        `);
      }

      queries.push(`
        UPDATE attributes SET
          token_count = GREATEST(token_count - 1, 0),
          updated_at = now()
        WHERE id IN (
          SELECT attributes.id
          FROM token_attributes ta
          JOIN attributes ON ta.attribute_id = attributes.id
          WHERE ta.contract = $/contract/
          AND ta.token_id = $/tokenId/
          AND ta.key != ''
        )
      `);

      await idb.none(pgp.helpers.concat(queries), {
        contract: toBuffer(contract),
        tokenId,
        collection: collection?.id,
      });
    }
  }

  public async addToQueue(tokens: BurnedTokenJobPayload[]) {
    await this.sendBatch(tokens.map((t) => ({ payload: t, jobId: `${t.contract}:${t.tokenId}` })));
  }
}

export const burnedTokenJob = new BurnedTokenJob();
