import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/payment-processor-base/builders/base";

import { redb } from "@/common/db";
import { toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/payment-processor-v2.0.1/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  tokenId: string;
}

export const build = async (options: BuildOrderOptions) => {
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
    // Skip if we cannot retrieve the token's collection
    throw new Error("Could not fetch token's collection");
  }

  const buildInfo = await utils.getBuildInfo(options, collectionResult.collection_id, "buy");
  if (!buildInfo) {
    throw new Error("Could not generate build info");
  }

  const builder: BaseBuilder = new Sdk.PaymentProcessorBase.Builders.SingleToken(config.chainId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (buildInfo.params as any).tokenId = options.tokenId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (buildInfo.params as any).beneficiary = options.maker;

  return builder?.build(buildInfo.params, Sdk.PaymentProcessorV201.Order);
};
