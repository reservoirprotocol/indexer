import { BigNumber } from "@ethersproject/bignumber";
import * as Sdk from "@reservoir0x/sdk";

import { baseProvider } from "@/common/provider";
import { redis } from "@/common/redis";
import { bn } from "@/common/utils";
import { config } from "@/config/index";

export type PaymentProcessorConfig = {
  securityPolicy: SecurityPolicy;
  paymentCoin?: string;
  pricingBounds?: PricingBounds;
};

export type SecurityPolicy = {
  id: string;
  enforceExchangeWhitelist: boolean;
  enforcePaymentMethodWhitelist: boolean;
  enforcePricingConstraints: boolean;
  disablePrivateListings: boolean;
  disableDelegatedPurchases: boolean;
  disableEIP1271Signatures: boolean;
  disableExchangeWhitelistEOABypass: boolean;
  pushPaymentGasLimit: string;
};

export type PricingBounds = {
  floorPrice: string;
  ceilingPrice: string;
};

export const getSecurityPolicyById = async (
  id: string,
  refresh?: boolean
): Promise<SecurityPolicy | undefined> => {
  const cacheKey = `payment-processor-security-policy-by-id:${id}`;

  let result = await redis
    .get(cacheKey)
    .then((r) => (r ? (JSON.parse(r) as SecurityPolicy) : undefined));

  if (!result || refresh) {
    try {
      // TODO: Better be explicit and write down the interfaces that are being used
      const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId).contract.connect(
        baseProvider
      );

      const securityPolicy = await exchange.getSecurityPolicy(id);
      result = {
        id: bn(id).toString(),
        enforceExchangeWhitelist: securityPolicy.enforceExchangeWhitelist,
        enforcePaymentMethodWhitelist: securityPolicy.enforcePaymentMethodWhitelist,
        enforcePricingConstraints: securityPolicy.enforcePricingConstraints,
        disablePrivateListings: securityPolicy.disablePrivateListings,
        disableDelegatedPurchases: securityPolicy.disableDelegatedPurchases,
        disableEIP1271Signatures: securityPolicy.disableEIP1271Signatures,
        disableExchangeWhitelistEOABypass: securityPolicy.disableExchangeWhitelistEOABypass,
        pushPaymentGasLimit: securityPolicy.pushPaymentGasLimit,
      };

      await redis.set(cacheKey, JSON.stringify(result), "EX", 24 * 3600);
    } catch {
      // Skip errors
    }
  }

  return result;
};

export const getConfigByContract = async (
  contract: string,
  refresh?: boolean
): Promise<PaymentProcessorConfig | undefined> => {
  const cacheKey = `payment-processor-config-by-contract:${contract}`;

  let result = await redis
    .get(cacheKey)
    .then((r) => (r ? (JSON.parse(r) as PaymentProcessorConfig) : undefined));
  if (!result || refresh) {
    try {
      // TODO: Better be explicit and write down the interfaces that are being used
      const exchange = new Sdk.PaymentProcessor.Exchange(config.chainId).contract.connect(
        baseProvider
      );

      const securityPolicyId = await exchange.getTokenSecurityPolicyId(contract);
      const securityPolicy = await getSecurityPolicyById(securityPolicyId);
      if (securityPolicy?.enforcePricingConstraints) {
        const paymentCoin = await exchange.collectionPaymentCoins(contract);
        // Assume all tokens have the same pricing bounds
        const pricingBounds = {
          floorPrice: await exchange
            .getFloorPrice(contract, "0")
            .then((p: BigNumber) => p.toString()),
          ceilingPrice: await exchange
            .getCeilingPrice(contract, "0")
            .then((p: BigNumber) => p.toString()),
        };

        result = {
          securityPolicy,
          paymentCoin,
          pricingBounds,
        };
      } else if (securityPolicy) {
        result = {
          securityPolicy,
        };
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
