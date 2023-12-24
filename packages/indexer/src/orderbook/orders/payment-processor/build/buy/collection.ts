import * as Sdk from "@reservoir0x/sdk";
import { BaseBuilder } from "@reservoir0x/sdk/dist/payment-processor/builders/base";

import { redb } from "@/common/db";
import { config } from "@/config/index";
import * as utils from "@/orderbook/orders/payment-processor/build/utils";

interface BuildOrderOptions extends utils.BaseOrderBuildOptions {
  collection: string;
}

export const build = async (options: BuildOrderOptions) => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        collections.id
      FROM collections
      WHERE collections.id = $/collection/
    `,
    {
      collection: options.collection,
    }
  );
  if (!collectionResult?.id || collectionResult.id.includes(":")) {
    // Skip if the collection is not available or not supported (eg. range or list collection)
    throw new Error("Could not fetch collection");
  }

  const buildInfo = await utils.getBuildInfo(options, options.collection, "buy");
  if (!buildInfo) {
    throw new Error("Could not generate build info");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (buildInfo.params as any).collectionLevelOffer = true;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (buildInfo.params as any).sellerAcceptedOffer = true;

  const builder: BaseBuilder = new Sdk.PaymentProcessor.Builders.ContractWide(config.chainId);
  return builder.build(buildInfo.params);
};
