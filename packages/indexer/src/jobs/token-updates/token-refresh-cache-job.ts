/* eslint-disable @typescript-eslint/no-explicit-any */

import { Tokens } from "@/models/tokens";
import { idb } from "@/common/db";
import { now, toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import * as orderFixes from "@/jobs/order-fixes/fixes";
import { inject } from "@/api/index";
import { config } from "@/config/index";

export type TokenRefreshCacheJobPayload = {
  contract: string;
  tokenId: string;
  checkTopBid?: boolean;
};

export class TokenRefreshCacheJob extends AbstractRabbitMqJobHandler {
  queueName = "token-refresh-cache";
  maxRetries = 10;
  concurrency = 10;

  protected async process(token: TokenRefreshCacheJobPayload) {
    if (token.contract === "0x4923917e9e288b95405e2c893d0ac46b895dda22") {
      // Skip OpenSea Shared contract simulations
      return;
    }

    // Refresh the token floor ask and top bid
    await Tokens.recalculateTokenFloorSell(token.contract, token.tokenId);
    await Tokens.recalculateTokenTopBid(token.contract, token.tokenId);

    // Simulate and revalidate the floor ask on the token
    const floorAsk = await idb.oneOrNone(
      `
          SELECT
            tokens.floor_sell_id AS id
          FROM tokens
          WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
        `,
      {
        contract: toBuffer(token.contract),
        tokenId: token.tokenId,
      }
    );
    if (floorAsk) {
      // Revalidate
      await orderFixes.addToQueue([{ by: "id", data: { id: floorAsk.id } }]);

      // Simulate
      await inject({
        method: "POST",
        url: `/management/orders/simulate/v1`,
        headers: {
          "Content-Type": "application/json",
        },
        payload: {
          id: floorAsk.id,
        },
      });
    }

    // Top bid simulation is very costly so we only do it if explicitly requested
    if (token.checkTopBid) {
      // Simulate and revalidate the top bid on the token
      const topBid = await idb.oneOrNone(
        `
            SELECT
              o.id
            FROM orders o
            JOIN token_sets_tokens tst
              ON o.token_set_id = tst.token_set_id
            WHERE tst.contract = $/contract/
              AND tst.token_id = $/tokenId/
              AND o.side = 'buy'
              AND o.fillability_status = 'fillable'
              AND o.approval_status = 'approved'
              AND EXISTS(
                SELECT FROM nft_balances nb
                  WHERE nb.contract = $/contract/
                  AND nb.token_id = $/tokenId/
                  AND nb.amount > 0
                  AND nb.owner != o.maker
              )
            ORDER BY o.value DESC
            LIMIT 1
          `,
        {
          contract: toBuffer(token.contract),
          tokenId: token.tokenId,
        }
      );
      if (topBid) {
        // Revalidate
        await orderFixes.addToQueue([{ by: "id", data: { id: topBid.id } }]);

        // Simulate
        if (config.chainId === 1) {
          await inject({
            method: "POST",
            url: `/management/orders/simulate/v1`,
            headers: {
              "Content-Type": "application/json",
            },
            payload: {
              id: topBid.id,
            },
          });
        }
      }
    }
  }

  public async addToQueue(token: TokenRefreshCacheJobPayload) {
    await this.send({ payload: token, jobId: `${token.contract}:${token.tokenId}:${now()}` });
  }
}

export const tokenRefreshCacheJob = new TokenRefreshCacheJob();
