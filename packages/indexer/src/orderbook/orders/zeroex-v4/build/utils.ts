import * as Sdk from "@reservoir0x/sdk";
import { BaseBuildParams } from "@reservoir0x/sdk/dist/zeroex-v4/builders/base";

import { redb } from "@/common/db";
import { bn } from "@/common/utils";
import { config } from "@/config/index";

export interface BaseOrderBuildOptions {
  maker: string;
  contract?: string;
  weiPrice: string;
  orderbook: "reservoir";
  quantity?: number;
  nonce?: string;
  fee?: number[];
  feeRecipient?: string[];
  expirationTime?: number;
  automatedRoyalties?: boolean;
  excludeFlaggedTokens?: boolean;
}

export type OrderBuildInfo = {
  params: BaseBuildParams;
  kind: "erc721" | "erc1155";
};

export const getBuildInfo = async (
  options: BaseOrderBuildOptions,
  collection: string,
  side: "sell" | "buy"
): Promise<OrderBuildInfo> => {
  const collectionResult = await redb.oneOrNone(
    `
      SELECT
        contracts.kind,
        collections.royalties
      FROM collections
      JOIN contracts
        ON collections.contract = contracts.address
      WHERE collections.id = $/collection/
      LIMIT 1
    `,
    { collection }
  );
  if (!collectionResult) {
    throw new Error("Could not fetch collection");
  }

  const buildParams: BaseBuildParams = {
    direction: side,
    contract: options.contract!,
    maker: options.maker,
    paymentToken:
      side === "sell"
        ? Sdk.ZeroExV4.Addresses.Native[config.chainId]
        : Sdk.Common.Addresses.WNative[config.chainId],
    price: options.weiPrice,
    fees: [],
    amount: collectionResult.kind === "erc1155" ? options.quantity ?? "1" : undefined,
    expiry: Number(options.expirationTime) === 0 ? undefined : options.expirationTime,
    nonce: options.nonce,
  };

  // Keep track of the total amount of fees
  let totalFees = bn(0);

  if (options.automatedRoyalties) {
    // Include the royalties
    for (const { recipient, bps } of collectionResult.royalties || []) {
      if (recipient && Number(bps) > 0) {
        const fee = bn(bps).mul(options.weiPrice).div(10000).toString();
        buildParams.fees!.push({
          recipient,
          amount: fee,
        });

        totalFees = totalFees.add(fee);
      }
    }
  }

  if (options.fee && options.feeRecipient) {
    for (let i = 0; i < options.fee.length; i++) {
      const fee = bn(options.fee[i]).mul(options.weiPrice).div(10000).toString();
      buildParams.fees!.push({
        recipient: options.feeRecipient[i],
        amount: fee,
      });
      totalFees = totalFees.add(fee);
    }
  }

  buildParams.price = bn(buildParams.price).sub(totalFees);

  return {
    params: buildParams,
    kind: collectionResult.kind,
  };
};
