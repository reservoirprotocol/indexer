import { Interface, Result } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import * as Sdk from "@reservoir0x/sdk";

import { idb, ridb } from "@/common/db";
import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { fromBuffer, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import { Royalty, updateRoyaltySpec } from "@/utils/royalties";

export enum PaymentSettings {
  DefaultPaymentMethodWhitelist = 0,
  AllowAnyPaymentMethod = 1,
  CustomPaymentMethodWhitelist = 2,
  PricingConstraints = 3,
}

export type CollectionPaymentSettings = {
  paymentSettings: PaymentSettings;
  constrainedPricingPaymentMethod: string;
  royaltyBackfillNumerator: number;
  royaltyBountyNumerator: number;
  isRoyaltyBountyExclusive: boolean;
  blockTradesFromUntrustedChannels: boolean;
  pricingBounds?: PricingBounds;
  whitelistedPaymentMethods: string[];
};

export type PricingBounds = {
  floorPrice: string;
  ceilingPrice: string;
};

export const getDefaultPaymentMethods = async (): Promise<string[]> => {
  const cacheKey = "pp-v2-default-payment-methods";

  let result = await redis.get(cacheKey).then((r) => (r ? (JSON.parse(r) as string[]) : undefined));
  if (!result) {
    const exchange = new Contract(
      Sdk.PaymentProcessorV2.Addresses.Exchange[config.chainId],
      new Interface(["function getDefaultPaymentMethods() view returns (address[])"]),
      baseProvider
    );

    result = exchange.getDefaultPaymentMethods().then((c: Result) => c.map((d) => d.toLowerCase()));
    await redis.set(cacheKey, JSON.stringify(result), "EX", 7 * 24 * 3600);
  }

  return result!;
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
        Sdk.PaymentProcessorV2.Addresses.Exchange[config.chainId],
        new Interface([
          `function collectionPaymentSettings(address token) view returns (
            (
              uint8 paymentSettings,
              uint32 paymentMethodWhitelistId,
              address constrainedPricingPaymentMethod,
              uint16 royaltyBackfillNumerator,
              uint16 royaltyBountyNumerator,
              bool isRoyaltyBountyExclusive,
              bool blockTradesFromUntrustedChannels
            )
          )`,
        ]),
        baseProvider
      );

      const paymentSettings = await exchange.collectionPaymentSettings(contract);

      result = {
        paymentSettings: paymentSettings.paymentSettings,
        constrainedPricingPaymentMethod:
          paymentSettings.constrainedPricingPaymentMethod.toLowerCase(),
        royaltyBackfillNumerator: paymentSettings.royaltyBackfillNumerator,
        royaltyBountyNumerator: paymentSettings.royaltyBountyNumerator,
        isRoyaltyBountyExclusive: paymentSettings.isRoyaltyBountyExclusive,
        blockTradesFromUntrustedChannels: paymentSettings.blockTradesFromUntrustedChannels,
        whitelistedPaymentMethods:
          paymentSettings.paymentMethodWhitelistId === 0
            ? await getDefaultPaymentMethods()
            : await getWhitelistedPaymentMethods(paymentSettings.paymentMethodWhitelistId),
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

export const addTrustedChannel = async (tokenAddress: string, channel: string, signer: string) =>
  idb.none(
    `
      INSERT INTO payment_processor_v2_trusted_channels (
        contract,
        channel,
        signer
      ) VALUES (
        $/tokenAddress/,
        $/channel/,
        $/signer/
      ) ON CONFLICT DO NOTHING
    `,
    {
      tokenAddress: toBuffer(tokenAddress),
      channel: toBuffer(channel),
      signer: toBuffer(signer),
    }
  );

export const removeTrustedChannel = async (tokenAddress: string, channel: string) =>
  idb.none(
    `
      DELETE FROM payment_processor_v2_trusted_channels
      WHERE payment_processor_v2_trusted_channels.contract = $/tokenAddress/
        AND payment_processor_v2_trusted_channels.channel = $/channel/
    `,
    {
      tokenAddress: toBuffer(tokenAddress),
      channel: toBuffer(channel),
    }
  );

export const getAllTrustedChannels = async (tokenAddress: string) => {
  const results = await ridb.manyOrNone(
    `
      SELECT
        payment_processor_v2_trusted_channels.channel,
        payment_processor_v2_trusted_channels.signer
      FROM payment_processor_v2_trusted_channels
      WHERE payment_processor_v2_trusted_channels.contract = $/tokenAddress/
    `,
    {
      tokenAddress: toBuffer(tokenAddress),
    }
  );

  return results.map((c) => ({
    channel: fromBuffer(c.channel),
    signer: fromBuffer(c.signer),
  }));
};

export const saveBackfilledRoyalties = async (tokenAddress: string, royalties: Royalty[]) =>
  updateRoyaltySpec(
    tokenAddress,
    "pp-v2-backfill",
    royalties.some((r) => r.recipient !== AddressZero) ? royalties : undefined
  );

export const addPaymentMethodToWhitelist = async (id: number, paymentMethod: string) =>
  idb.none(
    `
      INSERT INTO payment_processor_v2_payment_methods (
        id,
        payment_method
      ) VALUES (
        $/id/,
        $/paymentMethod/
      ) ON CONFLICT DO NOTHING
    `,
    {
      id,
      paymentMethod: toBuffer(paymentMethod),
    }
  );

export const removePaymentMethodFromWhitelist = async (id: number, paymentMethod: string) =>
  idb.none(
    `
      DELETE FROM payment_processor_v2_payment_methods
      WHERE payment_processor_v2_payment_methods.id = $/id/
        AND payment_processor_v2_payment_methods.payment_method = $/paymentMethod/
    `,
    {
      id,
      paymentMethod: toBuffer(paymentMethod),
    }
  );

export const getWhitelistedPaymentMethods = async (id: number) => {
  const results = await ridb.manyOrNone(
    `
      SELECT
        payment_processor_v2_payment_methods.payment_method
      FROM payment_processor_v2_payment_methods
      WHERE payment_processor_v2_payment_methods.id = $/paymentMethodWhitelistId/
    `,
    {
      id,
    }
  );

  return results.map((c) => fromBuffer(c.payment_method));
};
