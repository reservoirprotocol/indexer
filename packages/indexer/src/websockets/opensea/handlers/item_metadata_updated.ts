/* eslint-disable @typescript-eslint/no-explicit-any */

import { ItemMetadataUpdatePayload } from "@opensea/stream-js";
import * as metadataIndexWrite from "@/jobs/metadata-index/write-queue";
import { logger } from "@/common/logger";
import { Tokens } from "@/models/tokens";
import { getSupportedChainName } from "@/websockets/opensea/utils";
import MetadataApi from "@/utils/metadata-api";

export const handleEvent = async (payload: ItemMetadataUpdatePayload | any): Promise<void> => {
  if (getSupportedChainName() != payload.item.chain.name) {
    return;
  }
  const [, contract, tokenId] = payload.item.nft_id.split("/");

  const token = await Tokens.getByContractAndTokenId(contract, tokenId);
  if (!token) {
    logger.warn(
      "opensea-websocket-ITEM_METADATA_UPDATED",
      `Token was not found for metadata event: ${JSON.stringify(payload)}`
    );
    return;
  }
  const request = {
    asset_contract: {
      address: "0x059edd72cd353df5106d2b9cc5ab83a52287ac3a",
    },
    token_id: tokenId,
    name: payload.item.metadata.name ?? undefined,
    description: payload.item.metadata.description ?? undefined,
    image_url: payload.item.metadata.image_url ?? undefined,
    animation_url: payload.item.metadata.animation_url ?? undefined,
    traits: payload.item.metadata.traits,
  };
  const metadata = await MetadataApi.parseTokenMetadata(request);

  logger.info(
    "opensea-websocket-ITEM_METADATA_UPDATED",
    `Metadata event received: ${JSON.stringify(
      payload
    )}.\nResponse from metadata API: ${JSON.stringify(metadata)}`
  );

  if (metadata) {
    await metadataIndexWrite.addToQueue([metadata]);
  }
};
