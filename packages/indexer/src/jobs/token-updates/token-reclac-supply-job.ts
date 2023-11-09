/* eslint-disable @typescript-eslint/no-explicit-any */

import { Tokens } from "@/models/tokens";
import { idb, redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import _ from "lodash";
import { acquireLock } from "@/common/redis";
import { getNetworkSettings } from "@/config/network";
import { logger } from "@/common/logger";

export type TokenRecalcSupplyPayload = {
  contract: string;
  tokenId: string;
};

export default class TokenReclacSupplyJob extends AbstractRabbitMqJobHandler {
  queueName = "token-reclac-supply";
  maxRetries = 10;
  concurrency = 10;
  useSharedChannel = true;
  lazyMode = true;

  public async process(payload: TokenRecalcSupplyPayload) {
    const { contract, tokenId } = payload;

    const token = await Tokens.getByContractAndTokenId(contract, tokenId);

    // For large supply tokens calc once a day
    if (
      token &&
      token.supply > 50000 &&
      !(await acquireLock(`${this.queueName}:${contract}:${tokenId}`, 60 * 60 * 24))
    ) {
      return;
    }

    const totalSupply = await this.calcTotalSupply(contract, tokenId);
    const totalRemainingSupply = await this.calcRemainingSupply(contract, tokenId);

    if (totalRemainingSupply > totalSupply) {
      logger.warn(
        this.queueName,
        `too many remaining supply contract ${contract} tokenId ${tokenId} totalSupply ${totalSupply} totalRemainingSupply ${totalRemainingSupply}`
      );
    }

    await idb.none(
      `
              UPDATE tokens SET
                supply = $/totalSupply/,
                remaining_supply = $/totalRemainingSupply/,
                updated_at = now()
              WHERE tokens.contract = $/contract/
                AND tokens.token_id = $/tokenId/
                AND (supply IS DISTINCT FROM $/totalSupply/ OR remaining_supply IS DISTINCT FROM $/totalRemainingSupply/)
            `,
      {
        contract: toBuffer(contract),
        tokenId,
        totalSupply,
        totalRemainingSupply,
      }
    );
  }

  public async calcRemainingSupply(contract: string, tokenId: string) {
    const limit = 1000;
    let remainingSupply = 0;
    let continuation = "";
    let nftBalances = [];

    const values: {
      contract: Buffer;
      tokenId: string;
      burnAddresses: Buffer[];
      limit: number;
      lastContract?: Buffer;
      lastTokenId?: string;
      lastOwner?: Buffer;
    } = {
      contract: toBuffer(contract),
      tokenId: tokenId,
      burnAddresses: getNetworkSettings().burnAddresses.map((address) => toBuffer(address)),
      limit,
    };

    do {
      const totalRemainingSupplyQuery = `
        SELECT contract, token_id, owner, amount
        FROM nft_balances
        WHERE contract = $/contract/
        AND token_id = $/tokenId/
        AND owner NOT IN ($/burnAddresses:list/)
        AND amount > 0
        ${continuation}
        ORDER BY contract, token_id, owner
        LIMIT $/limit/
      `;

      nftBalances = await redb.manyOrNone(totalRemainingSupplyQuery, values);
      continuation = `AND (contract, token_id, owner) > ($/lastContract/, $/lastTokenId/, $/lastOwner/)`;

      if (!_.isEmpty(nftBalances)) {
        remainingSupply += _.sumBy(nftBalances, (event) => Number(event.amount));

        const lastBalance = _.last(nftBalances);
        values.lastContract = lastBalance.contract;
        values.lastTokenId = lastBalance.token_id;
        values.lastOwner = lastBalance.owner;
      }
    } while (nftBalances.length >= limit);

    return remainingSupply;
  }

  public async calcTotalSupply(contract: string, tokenId: string) {
    const limit = 1000;
    let totalSupply = 0;
    let continuation = "";
    let transferEvents = [];

    const values: {
      contract: Buffer;
      tokenId: string;
      mintAddresses: Buffer[];
      limit: number;
      lastTimestamp?: string;
      lastTxHash?: Buffer;
      lastLogIndex?: number;
      lastBatchIndex?: number;
    } = {
      contract: toBuffer(contract),
      tokenId: tokenId,
      mintAddresses: getNetworkSettings().mintAddresses.map((address) => toBuffer(address)),
      limit,
    };

    do {
      const totalSupplyQuery = `
        SELECT amount, "timestamp", tx_hash, log_index, batch_index
        FROM nft_transfer_events
        WHERE address = $/contract/
        AND token_id = $/tokenId/
        AND nft_transfer_events.from IN ($/mintAddresses:list/)
        AND is_deleted = 0
        ${continuation}
        ORDER BY "timestamp", tx_hash, log_index, batch_index
        LIMIT $/limit/
      `;

      transferEvents = await redb.manyOrNone(totalSupplyQuery, values);
      continuation = `AND ("timestamp", tx_hash, log_index, batch_index) > ($/lastTimestamp/, $/lastTxHash/, $/lastLogIndex/, $/lastBatchIndex/)`;

      if (!_.isEmpty(transferEvents)) {
        totalSupply += _.sumBy(transferEvents, (event) => Number(event.amount));

        const lastEvent = _.last(transferEvents);
        values.lastTimestamp = lastEvent.timestamp;
        values.lastTxHash = lastEvent.tx_hash;
        values.lastLogIndex = lastEvent.log_index;
        values.lastBatchIndex = lastEvent.batch_index;
      }
    } while (transferEvents.length >= limit);

    return totalSupply;
  }

  public async addToQueue(tokens: TokenRecalcSupplyPayload[], delay = 60 * 5 * 1000) {
    await this.sendBatch(
      tokens.map((t) => ({ payload: t, jobId: `${t.contract}:${t.tokenId}`, delay }))
    );
  }
}

export const tokenReclacSupplyJob = new TokenReclacSupplyJob();
