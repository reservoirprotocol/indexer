import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/wyvern-v2.3/builders/base";

import { edb } from "@/common/db";
import { logger } from "@/common/logger";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/wyvern-v2.3/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  contract: string;
  tokenId: string;
}

export const build = async (options: BuildOrderOptions) => {
  try {
    // TODO: Include `NOT is_flagged` filter in the query
    const collectionResult = await edb.oneOrNone(
      `
        SELECT "t"."collection_id" FROM "tokens" "t"
        WHERE "t"."contract" = $/contract/
          AND "t"."token_id" = $/tokenId/
      `,
      {
        contract: toBuffer(options.contract),
        tokenId: options.tokenId,
      }
    );

    if (!collectionResult) {
      // Skip if we cannot retrieve the token's collection
      return undefined;
    }

    const buildInfo = await utils.getBuildInfo(options, collectionResult.collection_id, "buy");
    if (!buildInfo) {
      // Skip if we cannot generate the build information
      return undefined;
    }

    let builder: BaseBuilder | undefined;
    if (buildInfo.kind === "erc721") {
      builder =
        options.orderbook === "opensea"
          ? new Sdk.WyvernV23.Builders.Erc721.SingleToken.V2(config.chainId)
          : new Sdk.WyvernV23.Builders.Erc721.SingleToken.V1(config.chainId);
    } else if (buildInfo.kind === "erc1155") {
      builder =
        options.orderbook === "opensea"
          ? new Sdk.WyvernV23.Builders.Erc1155.SingleToken.V2(config.chainId)
          : new Sdk.WyvernV23.Builders.Erc1155.SingleToken.V1(config.chainId);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).contract = options.contract;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (buildInfo.params as any).tokenId = options.tokenId;

    return builder?.build(buildInfo.params);
  } catch (error) {
    logger.error("wyvern-v2.3-build-buy-token-order", `Failed to build order: ${error}`);
    return undefined;
  }
};
