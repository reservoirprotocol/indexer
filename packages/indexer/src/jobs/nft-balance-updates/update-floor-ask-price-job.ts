import { idb } from "@/common/db";
import { AbstractRabbitMqJobHandler, BackoffStrategy } from "@/jobs/abstract-rabbit-mq-job-handler";
import { toBuffer } from "@/common/utils";
import { logger } from "@/common/logger";

export type NftBalanceUpdateFloorAskJobPayload = {
  contract: string;
  tokenId: string;
  owner: string;
};

export default class NftBalanceUpdateFloorAskJob extends AbstractRabbitMqJobHandler {
  queueName = "nft-balance-updates-update-floor-ask-price-queue";
  maxRetries = 10;
  concurrency = 15;
  backoff = {
    type: "exponential",
    delay: 20000,
  } as BackoffStrategy;

  public async process(payload: NftBalanceUpdateFloorAskJobPayload) {
    const { contract, tokenId, owner } = payload;

    try {
      await idb.none(
        `
                WITH x AS (
                    SELECT 
                        nft_balances.contract,
                        nft_balances.token_id,
                        nft_balances.owner,
                        y.id as floor_sell_id,
                        y.value as floor_sell_value
                    FROM nft_balances
                    LEFT JOIN LATERAL(
                        SELECT
                            o.id,
                            o.value
                        FROM orders o 
                        JOIN token_sets_tokens tst
                        ON o.token_set_id = tst.token_set_id
                        WHERE tst.contract = nft_balances.contract
                        AND tst.token_id = nft_balances.token_id
                        AND o.maker = nft_balances.owner
                        AND o.side = 'sell'
                        AND o.fillability_status = 'fillable'
                        AND o.approval_status = 'approved'
                        AND nft_balances.amount > 0
                        ORDER BY o.value, o.fee_bps
                        LIMIT 1
                    ) y ON TRUE
                    WHERE nft_balances.contract = $/contract/
                    AND nft_balances.token_id = $/tokenId/
                    AND nft_balances.owner = $/owner/
                )
                UPDATE nft_balances AS nb
                SET floor_sell_id = x.floor_sell_id,
                    floor_sell_value = x.floor_sell_value,
                    updated_at = now()
                FROM x
                WHERE nb.contract = x.contract
                AND nb.token_id = x.token_id
                AND nb.owner = x.owner
                AND (
                    nb.floor_sell_id IS DISTINCT FROM x.floor_sell_id
                    OR nb.floor_sell_value IS DISTINCT FROM x.floor_sell_value
                )
          `,
        {
          contract: toBuffer(contract),
          tokenId,
          owner: toBuffer(owner),
        }
      );
    } catch (error) {
      logger.error(
        this.queueName,
        `Failed to process nft balance floor ask price info ${JSON.stringify(payload)}: ${error}`
      );
      throw error;
    }
  }

  public async addToQueue(infos: NftBalanceUpdateFloorAskJobPayload[]) {
    await this.sendBatch(
      infos.map((info) => {
        return {
          payload: info,
        };
      })
    );
  }
}

export const nftBalanceUpdateFloorAskJob = new NftBalanceUpdateFloorAskJob();
