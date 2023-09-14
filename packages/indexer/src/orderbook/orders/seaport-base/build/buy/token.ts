import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { BaseOrderBuildOptions, OrderBuildInfo } from "@/orderbook/orders/seaport-base/build/utils";

export interface BuildOrderOptions extends BaseOrderBuildOptions {
  contract: string;
  tokenId: string;
}

export class BuyTokenBuilderBase {
  private getBuildInfoFunc: (
    options: BaseOrderBuildOptions,
    collection: string,
    side: "sell" | "buy"
  ) => Promise<OrderBuildInfo>;

  constructor(
    getBuildInfoFunc: (
      options: BaseOrderBuildOptions,
      collection: string,
      side: "sell" | "buy"
    ) => Promise<OrderBuildInfo>
  ) {
    this.getBuildInfoFunc = getBuildInfoFunc;
  }

  public async build<T extends Sdk.SeaportBase.IOrder>(
    options: BuildOrderOptions,
    orderBuilder: { new (chainId: number, params: Sdk.SeaportBase.Types.OrderComponents): T }
  ): Promise<T> {
    const excludeFlaggedTokens = options.excludeFlaggedTokens
      ? "AND (tokens.is_flagged = 0 OR tokens.is_flagged IS NULL)"
      : "";

    const collectionResult = await redb.oneOrNone(
      `
            SELECT
              tokens.collection_id
            FROM tokens
            WHERE tokens.contract = $/contract/
            AND tokens.token_id = $/tokenId/
            ${excludeFlaggedTokens}
          `,
      {
        contract: toBuffer(options.contract),
        tokenId: options.tokenId,
      }
    );
    if (!collectionResult) {
      throw new Error("Could not retrieve token's collection");
    }

    const buildInfo = await this.getBuildInfoFunc(options, collectionResult.collection_id, "buy");

    const builder = new Sdk.SeaportBase.Builders.SingleToken(config.chainId);

    return builder.build(
      { ...buildInfo.params, tokenId: options.tokenId, amount: options.quantity },
      orderBuilder
    );
  }
}
