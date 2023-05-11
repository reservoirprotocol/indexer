import { fromBuffer, toBuffer } from "@/common/utils";
import { redb } from "@/common/db";
import { AddressZero } from "@ethersproject/constants";

import { ActivityType } from "@/elasticsearch/indexes/activities";
import { getActivityHash } from "@/elasticsearch/indexes/activities/utils";
import {
  BaseActivityBuilder,
  BuildParams,
  BuildInfo,
} from "@/elasticsearch/indexes/activities/base";

export class TransferActivityBuilder extends BaseActivityBuilder {
  getActivityType(buildInfo: BuildInfo): ActivityType {
    return fromBuffer(buildInfo.from) === AddressZero ? ActivityType.mint : ActivityType.transfer;
  }

  getId(buildInfo: BuildInfo): string {
    return getActivityHash(
      fromBuffer(buildInfo.event_tx_hash!),
      buildInfo.event_log_index!.toString(),
      buildInfo.event_batch_index!.toString()
    );
  }

  buildBaseQuery() {
    return `
                SELECT
                  address AS "contract",
                  token_id,
                  "from",
                  "to",
                  amount,
                  tx_hash AS "event_tx_hash",
                  timestamp AS "event_timestamp",
                  block_hash AS "event_block_hash",
                  log_index AS "event_log_index",
                  batch_index AS "event_batch_index",
                  t.*
                FROM nft_transfer_events
                LEFT JOIN LATERAL (
                    SELECT
                        tokens.name AS "token_name",
                        tokens.image AS "token_image",
                        collections.id AS "collection_id",
                        collections.name AS "collection_name",
                        (collections.metadata ->> 'imageUrl')::TEXT AS "collection_image"
                    FROM tokens
                    JOIN collections on collections.id = tokens.collection_id
                    WHERE nft_transfer_events.address = tokens.contract
                    AND nft_transfer_events.token_id = tokens.token_id
                 ) t ON TRUE`;
  }

  async getBuildInfo(params: BuildParams) {
    const result = await redb.oneOrNone(
      `
                ${this.buildBaseQuery()}
                WHERE tx_hash = $/txHash/
                AND log_index = $/logIndex/
                AND batch_index = $/batchIndex/
                LIMIT 1;  
                `,
      {
        txHash: toBuffer(params.txHash!),
        logIndex: params.logIndex!.toString(),
        batchIndex: params.batchIndex!.toString(),
      }
    );

    return this.formatData(result);
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  formatData(result: any): BuildInfo {
    result.timestamp = result.event_timestamp;

    return result;
  }
}
