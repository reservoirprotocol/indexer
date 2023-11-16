import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { config } from "@/config/index";

export enum PaymentSettings {
  DefaultPaymentMethodWhitelist = 0,
  AllowAnyPaymentMethod = 1,
  CustomPaymentMethodWhitelist = 2,
  PricingConstraints = 3,
}

export type CollectionPaymentSettings = {
  paymentSettings: PaymentSettings;
  paymentMethodWhitelistId: number;
  constrainedPricingPaymentMethod: string;
  royaltyBackfillNumerator: number;
  royaltyBountyNumerator: number;
  isRoyaltyBountyExclusive: boolean;
  pricingBounds?: PricingBounds;
};

export type PricingBounds = {
  floorPrice: string;
  ceilingPrice: string;
};

export const getCollectionPaymentSettings = async (
  contract: string,
  refresh?: boolean
): Promise<CollectionPaymentSettings | undefined> => {
  const cacheKey = `payment-processor-v2-payment-settings-by-contract:${contract}`;

  let result = await redis
    .get(cacheKey)
    .then((r) => (r ? (JSON.parse(r) as CollectionPaymentSettings) : undefined));
  if (!result || refresh) {
    try {
      const exchange = new Contract(
        Sdk.PaymentProcessor.Addresses.Exchange[config.chainId],
        new Interface([
          `function collectionPaymentSettings(address collection) external view returns (
            (
              uint8 paymentSettings,
              uint32 paymentMethodWhitelistId,
              address constrainedPricingPaymentMethod,
              uint16 royaltyBackfillNumerator,
              uint16 royaltyBountyNumerator,
              bool isRoyaltyBountyExclusive,
            )
          )`,
        ]),
        baseProvider
      );

      const collectionPaymentSettings = await exchange.collectionPaymentSettings(contract);
      result = {
        paymentSettings: collectionPaymentSettings.paymentSettings,
        paymentMethodWhitelistId: collectionPaymentSettings.paymentMethodWhitelistId,
        constrainedPricingPaymentMethod: collectionPaymentSettings.constrainedPricingPaymentMethod,
        royaltyBackfillNumerator: collectionPaymentSettings.royaltyBackfillNumerator,
        royaltyBountyNumerator: collectionPaymentSettings.royaltyBountyNumerator,
        isRoyaltyBountyExclusive: collectionPaymentSettings.isRoyaltyBountyExclusive,
      };

      if (result?.paymentSettings === PaymentSettings.PricingConstraints) {
        const pricingBounds = {
          floorPrice: await exchange
            .getFloorPrice(contract, "0")
            .then((p: BigNumber) => p.toString()),
          ceilingPrice: await exchange
            .getCeilingPrice(contract, "0")
            .then((p: BigNumber) => p.toString()),
        };
        result.pricingBounds = pricingBounds;
      }
      if (result) {
        await redis.set(cacheKey, JSON.stringify(result), "EX", 24 * 3600);
      }
    } catch {
      // Skip errors
    }
  }

  return result;
};
