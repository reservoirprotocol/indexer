/* eslint-disable @typescript-eslint/no-explicit-any */

import { fromBuffer, toBuffer } from "@/common/utils";
import { redb } from "@/common/db";

import { ActivityDocument, ActivityType } from "@/elasticsearch/indexes/activities/base";
import { getActivityHash } from "@/elasticsearch/indexes/activities/utils";
import { BaseActivityEventHandler } from "@/elasticsearch/indexes/activities/event-handlers/base";
import { getNetworkSettings } from "@/config/network";
import { logger } from "@/common/logger";

export class NftTransferEventCreatedEventHandler extends BaseActivityEventHandler {
  public txHash: string;
  public logIndex: number;
  public batchIndex: number;

  constructor(txHash: string, logIndex: number, batchIndex: number) {
    super();

    this.txHash = txHash;
    this.logIndex = logIndex;
    this.batchIndex = batchIndex;
  }

  async generateActivity(): Promise<ActivityDocument | null> {
    const data = await redb.oneOrNone(
      `
                ${NftTransferEventCreatedEventHandler.buildBaseQuery()}
                WHERE tx_hash = $/txHash/
                AND log_index = $/logIndex/
                AND batch_index = $/batchIndex/
                LIMIT 1;  
                `,
      {
        txHash: toBuffer(this.txHash),
        logIndex: this.logIndex.toString(),
        batchIndex: this.batchIndex.toString(),
      }
    );

    if (!data) {
      logger.warn(
        "NftTransferEventCreatedEventHandler",
        `failed to generate elastic activity activity. txHash=${this.txHash}, logIndex=${this.logIndex}, logIndex=${this.logIndex}`
      );

      return null;
    }

    return this.buildDocument(data);
  }

  getActivityType(data: any): ActivityType {
    return getNetworkSettings().mintAddresses.includes(fromBuffer(data.from))
      ? ActivityType.mint
      : ActivityType.transfer;
  }

  getActivityId(): string {
    return getActivityHash(this.txHash, this.logIndex.toString(), this.batchIndex.toString());
  }

  public static buildBaseQuery() {
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
                        tokens.media AS "token_media",
                        collections.id AS "collection_id",
                        collections.name AS "collection_name",
                        (collections.metadata ->> 'imageUrl')::TEXT AS "collection_image"
                    FROM tokens
                    JOIN collections on collections.id = tokens.collection_id
                    WHERE nft_transfer_events.address = tokens.contract
                    AND nft_transfer_events.token_id = tokens.token_id
                 ) t ON TRUE`;
  }

  parseEvent(data: any) {
    data.timestamp = data.event_timestamp;
  }
}
