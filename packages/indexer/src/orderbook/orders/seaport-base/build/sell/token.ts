import * as Sdk from "@reservoir0x/sdk";

import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { BaseOrderBuildOptions, OrderBuildInfo } from "@/orderbook/orders/seaport-base/build/utils";

export interface BuildOrderOptions extends BaseOrderBuildOptions {
  tokenId: string;
}

export class SellTokenBuilderBase {
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
    const collectionResult = await redb.oneOrNone(
      `
        SELECT
          tokens.collection_id
        FROM tokens
        WHERE tokens.contract = $/contract/
          AND tokens.token_id = $/tokenId/
      `,
      {
        contract: toBuffer(options.contract!),
        tokenId: options.tokenId,
      }
    );
    if (!collectionResult) {
      throw new Error("Could not retrieve token's collection");
    }

    const buildInfo = await this.getBuildInfoFunc(options, collectionResult.collection_id, "sell");

    const builder = new Sdk.SeaportBase.Builders.SingleToken(config.chainId);
    return builder.build({ ...buildInfo.params, tokenId: options.tokenId }, orderBuilder);
  }
}
