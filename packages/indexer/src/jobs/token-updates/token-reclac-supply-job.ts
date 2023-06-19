/* eslint-disable @typescript-eslint/no-explicit-any */

import { Tokens } from "@/models/tokens";
import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AddressZero } from "@ethersproject/constants";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";

export type TokenRecalcSupplyPayload = {
  contract: string;
  tokenId: string;
};

export class TokenReclacSupplyJob extends AbstractRabbitMqJobHandler {
  queueName = "token-reclac-supply";
  maxRetries = 10;
  concurrency = 10;
  useSharedChannel = true;
  lazyMode = true;

  protected async process(payload: TokenRecalcSupplyPayload) {
    const { contract, tokenId } = payload;

    const totalSupplyQuery = `
      SELECT SUM(amount) AS "supply"
      FROM nft_transfer_events
      WHERE address = $/contract/
      AND token_id = $/tokenId/
      AND nft_transfer_events.from = $/addressZero/
    `;

    const totalSupply = await redb.oneOrNone(totalSupplyQuery, {
      contract: toBuffer(contract),
      tokenId: tokenId,
      addressZero: toBuffer(AddressZero),
    });

    const totalRemainingSupplyQuery = `
      SELECT COALESCE(SUM(amount), 0) AS "remainingSupply"
      FROM nft_balances
      WHERE contract = $/contract/
      AND token_id = $/tokenId/
      AND owner != $/addressZero/
      AND amount > 0
    `;

    const totalRemainingSupply = await redb.oneOrNone(totalRemainingSupplyQuery, {
      contract: toBuffer(contract),
      tokenId: tokenId,
      addressZero: toBuffer(AddressZero),
    });

    await Tokens.update(contract, tokenId, {
      supply: totalSupply.supply,
      remainingSupply: totalRemainingSupply.remainingSupply,
    });
  }

  public async addToQueue(tokens: TokenRecalcSupplyPayload[], delay = 60 * 5 * 1000) {
    await this.sendBatch(
      tokens.map((t) => ({ payload: t, jobId: `${t.contract}:${t.tokenId}`, delay }))
    );
  }
}

export const tokenReclacSupplyJob = new TokenReclacSupplyJob();
