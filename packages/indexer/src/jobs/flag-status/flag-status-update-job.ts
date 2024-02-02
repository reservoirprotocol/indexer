import { idb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { AbstractRabbitMqJobHandler } from "@/jobs/abstract-rabbit-mq-job-handler";
import { nonFlaggedFloorQueueJob } from "@/jobs/collection-updates/non-flagged-floor-queue-job";
import * as tokenSets from "@/orderbook/token-sets";

export type FlagStatusUpdateJobPayload = {
  contract: string;
  tokenId: string;
  isFlagged: boolean | null;
};

export default class FlagStatusUpdateJob extends AbstractRabbitMqJobHandler {
  queueName = "flag-status-update";
  maxRetries = 10;
  concurrency = 20;

  public async process(payload: FlagStatusUpdateJobPayload) {
    const { contract, tokenId, isFlagged } = payload;

    const result = await idb.oneOrNone(
      `
          SELECT
            (CASE
              WHEN tokens.is_flagged = 1 THEN true
              ELSE false
            END) AS is_flagged,
            tokens.collection_id
          FROM tokens
          WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
        `,
      {
        contract: toBuffer(contract),
        tokenId,
      }
    );

    if (result) {
      if (result.is_flagged !== isFlagged) {
        await idb.none(
          `
              UPDATE tokens SET
                is_flagged = $/isFlagged/,
                last_flag_change = now(),
                last_flag_update = now(),
                updated_at = now()
              WHERE tokens.contract = $/contract/
                AND tokens.token_id = $/tokenId/
            `,
          {
            contract: toBuffer(contract),
            tokenId,
            isFlagged: isFlagged ? 1 : 0,
          }
        );

        // Trigger further processes that depend on flagged tokens changes
        await Promise.all([
          // Update the token's collection cached non-flagged floor ask
          nonFlaggedFloorQueueJob.addToQueue([
            {
              kind: "revalidation",
              contract,
              tokenId,
              txHash: null,
              txTimestamp: null,
            },
          ]),

          // Update the dynamic collection non-flagged token set
          tokenSets.dynamicCollectionNonFlagged.update(
            { collection: result.collection_id },
            { contract, tokenId },
            isFlagged ? "remove" : "add"
          ),
        ]);
      } else {
        await idb.none(
          `
              UPDATE tokens SET
                last_flag_update = now(),
                updated_at = now()
              WHERE tokens.contract = $/contract/
                AND tokens.token_id = $/tokenId/
            `,
          {
            contract: toBuffer(contract),
            tokenId,
          }
        );
      }
    }
  }

  public async addToQueue(params: FlagStatusUpdateJobPayload[]) {
    await this.sendBatch(params.map((flag) => ({ payload: flag })));
  }
}

export const flagStatusUpdateJob = new FlagStatusUpdateJob();
