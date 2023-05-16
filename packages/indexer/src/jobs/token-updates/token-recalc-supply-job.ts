/* eslint-disable @typescript-eslint/no-explicit-any */

import { Tokens } from "@/models/tokens";
import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AddressZero } from "@ethersproject/constants";
import { KafkaEventHandler, KafkaProducer } from "@/common/kafka";

export class TokenRecalcSupplyJob extends KafkaEventHandler {
  maxRetries = 10;
  topicName = "token-reclac-supply";

  protected async process(payload: any) {
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
      tokenId,
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
      tokenId,
      addressZero: toBuffer(AddressZero),
    });

    await Tokens.update(contract, tokenId, {
      supply: totalSupply.supply,
      remainingSupply: totalRemainingSupply.remainingSupply,
    });
  }

  async addToQueue(tokens: { contract: string; tokenId: string }[], delay = 60 * 5 * 1000) {
    const messages = tokens.map((t) => ({
      value: JSON.stringify({
        payload: { contract: t.contract, tokenId: t.tokenId },
      }),
    }));

    await KafkaProducer.send({
      topic: this.getTopic(),
      messages,
      delay,
    });
  }
}
