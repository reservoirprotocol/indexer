import { Interface } from "@ethersproject/abi";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 as keccakWithoutTypes } from "@ethersproject/keccak256";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import { TokenIDs } from "fummpel";
import _ from "lodash";
import MerkleTree from "merkletreejs";
import pLimit from "p-limit";

import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import {
  CollectionPoolType,
  getCollectionPool,
  saveCollectionPool,
} from "@/models/collection-pools";
import { Sources } from "@/models/sources";
import {
  POOL_ORDERS_MAX_PRICE_POINTS_COUNT,
  DbOrder,
  OrderMetadata,
  generateSchemaHash,
} from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import { getUSDAndNativePrices } from "@/utils/prices";
import * as royalties from "@/utils/royalties";

const hashFn = (tokenId: BigNumberish) => keccak256(["uint256"], [tokenId]);

const generateMerkleTree = (tokenIds: BigNumberish[]) => {
  if (!tokenIds.length) {
    throw new Error("Could not generate merkle tree");
  }

  const leaves = tokenIds.map(hashFn);
  return new MerkleTree(leaves, keccakWithoutTypes, { sort: true });
};

const hexToBytes = (input: string): Uint8Array => {
  if (input[0] != "0" && input[1] != "x") {
    throw new Error("Invalid hex input");
  }

  const hex = input.slice(2);
  if (hex.length === 0) {
    return new Uint8Array([]);
  }

  const digits = hex.match(/[0-9a-fA-F]{2}/g);
  if (digits!.length * 2 != hex.length) {
    throw new Error("Invalid hex input");
  }

  return new Uint8Array(digits!.map((h) => parseInt(h, 16)));
};

const FACTORY = Sdk.CollectionXyz.Addresses.CollectionPoolFactory[config.chainId];

export type OrderInfo = {
  orderParams: {
    pool: string;
    // Should be undefined if the trigger was an event which should not change
    // the existing merkle root. 0x hex string. "0x" for unfiltered pools.
    encodedTokenIds?: string;
    // If it's a modifier event, delay until a row with maker == poolAddress
    // exists in orders table
    isModifierEvent: boolean;
    feesModified: boolean;
    // Only defined if event sets/modifies fallback
    royaltyRecipientFallback: string | undefined;
    // Only defined if assetRecipient is being set/modified. assetRecipient === pool for
    // TRADE pools
    assetRecipient: string | undefined;
    // Only defined if externalFilter is being set/modified. assetRecipient === pool for
    // TRADE pools
    externalFilter: string | undefined;
    // Validation parameters (for ensuring only the latest event is relevant)
    txHash: string;
    txTimestamp: number;
    txBlock: number;
    logIndex: number;
    // Misc options
    forceRecheck?: boolean;
  };
  metadata: OrderMetadata;
};

type SaveResult = {
  id: string;
  txHash: string;
  txTimestamp: number;
  status: string;
  triggerKind?: "new-order" | "reprice";
};

/**
 * Get all fee information for a pool and format the fee breakdown. Basis points
 * returned are not integers.
 *
 * @param orderId If a row in the db has this order id simply return fee info
 * from the existing row
 */
const getFeeBpsAndBreakdown = async (
  poolContract: Contract,
  royaltyRecipient: string,
  orderId: string,
  feesUpdated: boolean
): Promise<{
  feeBreakdown: {
    kind: string;
    recipient: string;
    bps: number;
  }[];
  totalFeeBps: number;
}> => {
  const orderResult = await idb.oneOrNone(
    `
      SELECT
        orders.fee_breakdown,
        orders.fee_bps
      FROM orders
      WHERE orders.id = $/orderId/
    `,
    { orderId }
  );
  if (orderResult && !feesUpdated) {
    // Row exists, return relevant rows
    return {
      feeBreakdown: orderResult.fee_breakdown,
      totalFeeBps: orderResult.fee_bps,
    };
  } else {
    const [tradeBps, protocolBps, royaltyBps, carryBps] = (await poolContract.feeMultipliers()).map(
      (fee: number) => fee / 100
    );

    // Carry fee doesn't add to input amount
    const totalFeeBps = royaltyBps + protocolBps + tradeBps;
    const feeBreakdown: {
      kind: string;
      recipient: string;
      bps: number;
    }[] = [
      {
        // Protocol fee
        kind: "marketplace",
        recipient: FACTORY,
        bps: Math.round(protocolBps + (tradeBps * carryBps) / 1e5),
      },
      {
        // Trade fee
        kind: "marketplace",
        recipient: poolContract.address,
        bps: Math.round(tradeBps),
      },
      {
        // Royalty fee
        kind: "royalty",
        recipient: royaltyRecipient,
        bps: Math.round(royaltyBps),
      },
    ].filter(({ bps }) => bps > 0);

    return { totalFeeBps, feeBreakdown };
  }
};

/**
 * The `order` table needs numbers in both the order's currency as well as
 * native currency for `price`, `value`, and `normalizedValue`. This function
 * returns the currency values of these quantities given `currency`
 */
const convertCurrencies = async (
  currency: string,
  currencyPrice: BigNumber,
  currencyValue: BigNumber,
  currencyNormalizedValue: BigNumber
): Promise<{
  price: BigNumber;
  value: BigNumber;
  normalizedValue: BigNumber;
}> => {
  const isERC20 = currency !== Sdk.Common.Addresses.Eth[config.chainId];
  if (isERC20) {
    const prices = await getUSDAndNativePrices(currency, currencyPrice.toString(), now());
    const values = await getUSDAndNativePrices(currency, currencyValue.toString(), now());
    const normalizedValues = await getUSDAndNativePrices(
      currency,
      currencyNormalizedValue.toString(),
      now()
    );
    if (!prices.nativePrice || !values.nativePrice || !normalizedValues.nativePrice) {
      // Getting the native price is a must
      throw new Error("failed-to-convert-price");
    }

    currencyPrice = bn(prices.nativePrice);
    currencyValue = bn(values.nativePrice);
    currencyNormalizedValue = bn(normalizedValues.nativePrice);
  }

  return {
    price: currencyPrice,
    value: currencyValue,
    normalizedValue: currencyNormalizedValue,
  };
};

/**
 * Get the address which the pool would pay royalties to for `tokenId`
 */
const getRoyaltyRecipient = async (
  nftAddress: string,
  tokenId: BigNumber,
  fallback: string,
  assetRecipient: string
): Promise<string> => {
  let erc2981Recipient = AddressZero;
  try {
    const onChainRoyalties = await royalties.getRoyalties(
      nftAddress,
      tokenId.toString(),
      "onchain"
    );
    // Assume ERC2981 if and only if 1 recipient
    if (onChainRoyalties.length !== 1) throw new Error();
    erc2981Recipient = onChainRoyalties[0].recipient;
  } catch {
    // Leave as address(0)
  }

  // Replicate contract logic
  if (erc2981Recipient !== AddressZero) {
    return erc2981Recipient;
  } else if (fallback !== AddressZero) {
    return fallback!;
  } else return assetRecipient!;
};

/**
 * Get all missing default royalties as well as the sum of missing royalties if
 * a swap took place at a pre-fee price of `currencyPrice`.
 */
const computeRoyaltyInfo = async (
  nftAddress: string,
  currencyPrice: BigNumber,
  poolRoyaltyBps: number,
  royaltyRecipient: string
): Promise<{
  missingRoyaltyAmount: BigNumber;
  missingRoyalties: { bps: number; amount: string; recipient: string }[];
}> => {
  let missingRoyaltyAmount = bn(0);
  const missingRoyalties: { bps: number; amount: string; recipient: string }[] = [];

  const defaultRoyalties = (
    await royalties.getRoyaltiesByTokenSet(`contract:${nftAddress}`.toLowerCase(), "default")
  ).filter(({ recipient }) => recipient !== AddressZero);

  defaultRoyalties.forEach(({ recipient, bps }) => {
    if (recipient === royaltyRecipient) {
      const shortfallBps = Math.max(0, bps - poolRoyaltyBps);
      if (shortfallBps > 0) {
        const shortfallAmount = currencyPrice.mul(shortfallBps).div(10000);
        missingRoyaltyAmount = missingRoyaltyAmount.add(shortfallAmount);
        missingRoyalties.push({
          bps: shortfallBps,
          amount: shortfallAmount.toString(),
          recipient,
        });
      }
    } else {
      const amount = currencyPrice.mul(bps).div(10000);
      missingRoyaltyAmount = missingRoyaltyAmount.add(amount);
      missingRoyalties.push({
        bps,
        amount: amount.toString(),
        recipient,
      });
    }
  });

  return { missingRoyaltyAmount, missingRoyalties };
};

/**
 * Retrieve a pool's address, nftAddress, tokenAddress, bondingCurveAddress,
 * poolType and poolVariant from DB if it exists. If it does not, queries the
 * pool for these values and saves them in the DB. Effectively a cache load for
 * immutable params.
 */
export const getPoolDetails = async (address: string) =>
  getCollectionPool(address).catch(async () => {
    if (Sdk.CollectionXyz.Addresses.CollectionPoolFactory[config.chainId]) {
      const poolIface = new Interface([
        "function nft() public pure returns (address)",
        "function token() public pure returns (address)",
        "function bondingCurve() public pure returns (address)",
        "function poolType() public pure returns (uint8)",
        "function poolVariant() public pure returns (uint8)",
      ]);

      try {
        const pool = new Contract(address, poolIface, baseProvider);

        const nft = (await pool.nft()).toLowerCase();
        const bondingCurve = (await pool.bondingCurve()).toLowerCase();
        const poolType = await pool.poolType();
        const poolVariant = await pool.poolVariant();
        const token = poolVariant > 1 ? (await pool.token()).toLowerCase() : AddressZero;

        const factory = new Contract(
          Sdk.CollectionXyz.Addresses.CollectionPoolFactory[config.chainId],
          new Interface([
            "function isPoolVariant(address potentialPool, uint8 variant) public view returns (bool)",
          ]),
          baseProvider
        );
        if (await factory.isPoolVariant(address, poolVariant)) {
          return saveCollectionPool({
            address,
            nft,
            token,
            bondingCurve,
            poolType,
            poolVariant,
          });
        }
      } catch {
        // Skip any errors
      }
    }
  });

/**
 * Generate an order id deterministically for a pool order
 */
export const getOrderId = (pool: string, side: "sell" | "buy", tokenId?: string) =>
  side === "buy"
    ? // Buy orders have a single order id per pool
      keccak256(["string", "address", "string"], ["collectionxyz", pool, side])
    : // Sell orders have multiple order ids per pool (one for each potential token id)
      keccak256(["string", "address", "string", "uint256"], ["collectionxyz", pool, side, tokenId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: OrderInfo) => {
    try {
      const pool = await getPoolDetails(orderParams.pool);
      if (!pool) {
        throw new Error("Could not fetch pool details");
      }

      const poolContract = new Contract(
        pool.address,
        new Interface([
          `
            function getBuyNFTQuote(uint256) public view returns (
              tuple(uint128 spotPrice,uint128 delta,bytes props,bytes state) newParams,
              uint256 totalAmount,
              uint256 inputAmount,
              tuple(uint256 trade,uint256 protocol,uint256[] royalties) fees
            )
          `,
          `
            function getSellNFTQuote(uint256) view returns (
              (uint128,uint128,bytes,bytes) newParams,
              uint256 totalAmount,
              uint256 outputAmount,
              (uint256,uint256,uint256[]) fees
            )
          `,
          `function liquidity() view returns (uint256)`,
          `function feeMultipliers() view returns (
            tuple(uint24 trade,uint24 protocol,uint24 royaltyNumerator,uint24 carry)
          )`,
          `function getRoyaltyRecipient(address payable erc2981Recipient) view returns (address payable)`,
          `function getAllHeldIds() view returns (uint256[])`,
          `function tokenIDFilterRoot() view returns (bytes32)`,
          `function externalFilter() public view returns (address)`,
        ]),
        baseProvider
      );

      const isERC20 = pool.token !== Sdk.Common.Addresses.Eth[config.chainId];

      // Force recheck at most once per hour
      const recheckCondition = orderParams.forceRecheck
        ? `AND orders.updated_at < to_timestamp(${orderParams.txTimestamp - 3600})`
        : `AND (orders.block_number, orders.log_index) < (${orderParams.txBlock}, ${orderParams.logIndex})`;

      // Handle bids
      try {
        if ([CollectionPoolType.TOKEN, CollectionPoolType.TRADE].includes(pool.poolType)) {
          const id = getOrderId(orderParams.pool, "buy");
          // Check if this is new order or update
          const orderResult = await idb.oneOrNone(
            `
              SELECT
                orders.token_set_id,
                orders.token_set_schema_hash,
                orders.raw_data
              FROM orders
              WHERE orders.id = $/id/
            `,
            { id }
          );

          // For now, we don't handle bids from pools with dynamic external filters.
          // Exit if this pool is already saved with a nonzero filter or external
          // filter is being set to non zero address
          if (
            (orderParams.externalFilter ?? orderResult?.raw_data?.externalFilter ?? AddressZero) !==
            AddressZero
          ) {
            results.push({
              id,
              txHash: orderParams.txHash,
              txTimestamp: orderParams.txTimestamp,
              status: "external-filtered-bids-not-supported",
            });

            // Throw an error instead of returning because we want to process
            // the ask even if it has an external filter
            throw new Error("external-filtered-bids-not-supported");
          }

          const tokenBalance: BigNumber = await poolContract.liquidity();

          const { totalAmount: currencyPrice }: { totalAmount: BigNumber } =
            await poolContract.getSellNFTQuote(1);

          if (currencyPrice.lte(tokenBalance)) {
            let tmpPriceList: (BigNumber | undefined)[] = Array.from(
              { length: POOL_ORDERS_MAX_PRICE_POINTS_COUNT },
              () => undefined
            );
            await Promise.all(
              _.range(0, POOL_ORDERS_MAX_PRICE_POINTS_COUNT).map(async (index) => {
                try {
                  const result = await poolContract.getSellNFTQuote(index + 1);
                  if (result.totalAmount.lte(tokenBalance)) {
                    tmpPriceList[index] = result.totalAmount;
                  }
                } catch {
                  // Ignore errors
                }
              })
            );

            // Stop when the first `undefined` is encountered
            const firstUndefined = tmpPriceList.findIndex((p) => p === undefined);
            if (firstUndefined !== -1) {
              tmpPriceList = tmpPriceList.slice(0, firstUndefined);
            }
            const priceList = tmpPriceList.map((p) => p!);

            const prices: BigNumber[] = [];
            for (let i = 0; i < priceList.length; i++) {
              prices.push(bn(priceList[i]).sub(i > 0 ? priceList[i - 1] : 0));
            }

            // Handle royalties and fees
            // For bids, we can't predict which tokenID is going to be sold
            // into the pool so we just use tokenID 0.
            const royaltyRecipient = await getRoyaltyRecipient(
              pool.nft,
              bn(0),
              // We have yet to validate the condition that:
              // orderParams.<fallback|assetRecipient> ?? existing <fallback|assetRecipient>
              // is defined. We will do so later before saving. Use AddressZero
              // as a placeholder
              orderParams.royaltyRecipientFallback ??
                orderResult?.raw_data?.royaltyRecipientFallback ??
                AddressZero,
              orderParams.assetRecipient ?? orderResult?.raw_data?.assetRecipient ?? AddressZero
            );

            const { feeBreakdown, totalFeeBps } = await getFeeBpsAndBreakdown(
              poolContract,
              royaltyRecipient,
              id,
              orderParams.feesModified
            );

            const currencyValue = currencyPrice.sub(currencyPrice.mul(totalFeeBps).div(10000));

            const { missingRoyaltyAmount, missingRoyalties } = await computeRoyaltyInfo(
              pool.nft,
              currencyPrice,
              feeBreakdown.filter((fee) => fee.kind === "royalty")[0]?.bps ?? 0,
              royaltyRecipient
            );
            const currencyNormalizedValue = bn(currencyValue).sub(missingRoyaltyAmount);

            // Handle price conversions to native currency
            let price: BigNumber;
            let value: BigNumber;
            let normalizedValue: BigNumber;
            try {
              ({ price, value, normalizedValue } = await convertCurrencies(
                pool.token,
                currencyPrice,
                currencyValue,
                currencyNormalizedValue
              ));
            } catch (err) {
              results.push({
                id,
                txHash: orderParams.txHash,
                txTimestamp: orderParams.txTimestamp,
                status: "failed-to-convert-price",
              });
              return;
            }

            if (!orderResult && orderParams.isModifierEvent) {
              results.push({
                id,
                txHash: orderParams.txHash,
                txTimestamp: orderParams.txTimestamp,
                status: "delayed",
              });
              return;
            }

            // If there's an existing order, first hold onto existing values.
            // If the orderParams passes encodedTokenIds, then it should mutate
            // these columns.
            let tokenSetId = orderResult?.token_set_id;
            let schemaHash = orderResult?.token_set_schema_hash;
            // Check if there's encodedTokenIds to process. If not, just don't
            // change the values existing in DB.
            if (orderParams.encodedTokenIds !== undefined) {
              const isFiltered = (await poolContract.tokenIDFilterRoot()) !== HashZero;
              if (!isFiltered) {
                // Non-filtered pool, save tokenSetId and schema hash of a
                // contract TokenSet
                schemaHash = generateSchemaHash();
                tokenSetId = `contract:${pool.nft}`.toLowerCase();
                await tokenSet.contractWide.save([
                  {
                    id: tokenSetId,
                    schemaHash,
                    contract: pool.nft,
                  },
                ]);
              } else {
                // Filtered pool, save tokenSetId and schema hash of a
                // token-list TokenSet
                const acceptedSet =
                  orderParams.encodedTokenIds.length === 0
                    ? []
                    : TokenIDs.decode(hexToBytes(orderParams.encodedTokenIds))
                        .tokens()
                        .map((bi) => BigNumber.from(bi));

                if (acceptedSet.length > config.maxTokenSetSize) {
                  results.push({
                    id,
                    txHash: orderParams.txHash,
                    txTimestamp: orderParams.txTimestamp,
                    status: "token-list-too-large",
                  });
                  return;
                }

                const merkleTree = generateMerkleTree(acceptedSet);
                tokenSetId = `list:${pool.nft}:${merkleTree.getHexRoot()}`;

                const schema = {
                  kind: "token-set", // The type of TokenList that just takes an array of token ids
                  data: {
                    collection: pool.nft,
                    tokenSetId, // Used for lookup in token set table
                  },
                };
                schemaHash = generateSchemaHash(schema);

                await tokenSet.mixedTokenList.save([
                  {
                    // This must === `list:${pool.nft}:${generateMerkleTree(acceptedSet).getHexRoot()}`
                    // in the TokenSet.isValid() function
                    id: tokenSetId,
                    schemaHash,
                    items: {
                      // This stores all tokenIds which are known to belong to this merkle tree
                      tokens: acceptedSet.map((bn) => `${pool.nft}:${bn.toString()}`),
                    },
                  },
                ]);
              }
            }

            // By this point, there should be a valid token set id and schema
            // hash for the order to be defined
            if (!tokenSetId || !schemaHash) {
              results.push({
                id,
                txHash: orderParams.txHash,
                txTimestamp: orderParams.txTimestamp,
                status: "invalid-token-set",
              });
              return;
            }

            // No entry found, create new row. Only columns which are constant
            // for all buy orders should be in this if-branch. Everything else
            // might need to be updated
            if (!orderResult) {
              if (
                orderParams.assetRecipient === undefined ||
                orderParams.royaltyRecipientFallback === undefined ||
                orderParams.externalFilter === undefined
              ) {
                results.push({
                  id,
                  txHash: orderParams.txHash,
                  txTimestamp: orderParams.txTimestamp,
                  status: "missing-necessary-new-pool-info",
                });
                return;
              }

              const sdkOrder: Sdk.CollectionXyz.Order = new Sdk.CollectionXyz.Order(
                config.chainId,
                {
                  pool: orderParams.pool,
                  externalFilter: orderParams.externalFilter,
                  tokenSetId,
                  assetRecipient: orderParams.assetRecipient,
                  royaltyRecipientFallback: orderParams.royaltyRecipientFallback,
                  extra: {
                    prices: prices.map((p) => p.toString()),
                  },
                }
              );

              // Handle: source
              const sources = await Sources.getInstance();
              const source = await sources.getOrInsert("collection.xyz");

              const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
              const validTo = `'Infinity'`;

              orderValues.push({
                id,
                kind: "collectionxyz",
                side: "buy",
                fillability_status: "fillable",
                approval_status: "approved",
                token_set_id: tokenSetId,
                token_set_schema_hash: toBuffer(schemaHash),
                maker: toBuffer(pool.address),
                taker: toBuffer(AddressZero),
                price: price.toString(),
                value: value.toString(),
                currency: toBuffer(pool.token),
                currency_price: currencyPrice.toString(),
                currency_value: currencyValue.toString(),
                needs_conversion: isERC20,
                quantity_remaining: prices.length.toString(),
                valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
                nonce: null,
                source_id_int: source?.id,
                is_reservoir: null,
                contract: toBuffer(pool.nft),
                conduit: null,
                fee_bps: Math.round(totalFeeBps),
                fee_breakdown: feeBreakdown,
                dynamic: null,
                raw_data: sdkOrder.params,
                expiration: validTo,
                missing_royalties: missingRoyalties,
                normalized_value: normalizedValue.toString(),
                currency_normalized_value: currencyNormalizedValue.toString(),
                block_number: orderParams.txBlock ?? null,
                log_index: orderParams.logIndex ?? null,
              });

              results.push({
                id,
                txHash: orderParams.txHash,
                txTimestamp: orderParams.txTimestamp,
                status: "success",
                triggerKind: "new-order",
              });
            } else {
              // There's already an order with this id. Update it.
              const sdkOrder: Sdk.CollectionXyz.Order = new Sdk.CollectionXyz.Order(
                config.chainId,
                orderResult.raw_data
              );

              sdkOrder.params.extra = {
                prices: prices.map((p) => p.toString()),
              };
              sdkOrder.params.tokenSetId = tokenSetId;

              if (orderParams.externalFilter !== undefined) {
                sdkOrder.params.externalFilter = orderParams.externalFilter;
              }

              if (orderParams.assetRecipient !== undefined) {
                sdkOrder.params.assetRecipient = orderParams.assetRecipient;
              }

              if (orderParams.assetRecipient !== undefined) {
                sdkOrder.params.assetRecipient = orderParams.assetRecipient;
              }

              await idb.none(
                `
                  UPDATE orders SET
                    fillability_status = 'fillable',
                    approval_status = 'approved',
                    price = $/price/,
                    currency_price = $/price/,
                    value = $/value/,
                    currency_value = $/value/,
                    quantity_remaining = $/quantityRemaining/,
                    valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                    expiration = 'Infinity',
                    updated_at = now(),
                    raw_data = $/rawData:json/,
                    missing_royalties = $/missingRoyalties:json/,
                    normalized_value = $/normalizedValue/,
                    currency_normalized_value = $/currencyNormalizedValue/,
                    fee_bps = $/feeBps/,
                    fee_breakdown = $/feeBreakdown:json/,
                    block_number = $/blockNumber/,
                    log_index = $/logIndex/,
                    token_set_id = $/tokenSetId/
                  WHERE orders.id = $/id/
                    ${recheckCondition}
                `,
                {
                  id,
                  price: price.toString(),
                  currencyPrice: currencyPrice.toString(),
                  value: value.toString(),
                  currencyValue: currencyValue.toString(),
                  rawData: sdkOrder.params,
                  quantityRemaining: prices.length.toString(),
                  missingRoyalties: missingRoyalties,
                  normalizedValue: normalizedValue.toString(),
                  currencyNormalizedValue: currencyNormalizedValue.toString(),
                  feeBps: Math.round(totalFeeBps),
                  feeBreakdown: feeBreakdown,
                  blockNumber: orderParams.txBlock,
                  logIndex: orderParams.logIndex,
                  tokenSetId,
                }
              );

              results.push({
                id,
                txHash: orderParams.txHash,
                txTimestamp: orderParams.txTimestamp,
                status: "success",
                triggerKind: "reprice",
              });
            }
          } else {
            // The pool didn't have balance to fulfill the order - update order status
            await idb.none(
              `
                UPDATE orders SET
                  fillability_status = 'no-balance',
                  expiration = to_timestamp(${orderParams.txTimestamp}),
                  block_number = $/blockNumber/,
                  log_index = $/logIndex/,
                  updated_at = now()
                WHERE orders.id = $/id/
                  ${recheckCondition}
              `,
              {
                id,
                blockNumber: orderParams.txBlock,
                logIndex: orderParams.logIndex,
              }
            );

            results.push({
              id,
              txHash: orderParams.txHash,
              txTimestamp: orderParams.txTimestamp,
              status: "success",
              triggerKind: "reprice",
            });
          }
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        // The only time we want to continue processing asks is if we threw an error due to an externally filtered bid
        if (!(error instanceof Error && error.message === "external-filtered-bids-not-supported")) {
          logger.error(
            "orders-collectionxyz-save",
            `Failed to handle buy order with params ${JSON.stringify(orderParams)}: ${error} (${
              error.stack
            })`
          );
        }
      }

      // Handle sell orders
      try {
        if ([CollectionPoolType.NFT, CollectionPoolType.TRADE].includes(pool.poolType)) {
          const { totalAmount: currencyPrice }: { totalAmount: BigNumber; inputAmount: BigNumber } =
            await poolContract.getBuyNFTQuote(1);
          const currencyValue = currencyPrice;

          // Fetch all token ids owned by the pool
          const poolOwnedTokenIds = ((await poolContract.getAllHeldIds()) as BigNumber[]).map(
            (bn) => bn.toString()
          );

          const length = Math.min(poolOwnedTokenIds.length, POOL_ORDERS_MAX_PRICE_POINTS_COUNT);
          let tmpPriceList: (BigNumber | undefined)[] = Array.from({ length }, () => undefined);
          await Promise.all(
            _.range(0, length).map(async (index) => {
              try {
                const result = await poolContract.getBuyNFTQuote(index + 1);
                tmpPriceList[index] = result.totalAmount;
              } catch {
                // Ignore errors
              }
            })
          );

          // Stop when the first `undefined` is encountered
          const firstUndefined = tmpPriceList.findIndex((p) => p === undefined);
          if (firstUndefined !== -1) {
            tmpPriceList = tmpPriceList.slice(0, firstUndefined);
          }
          const priceList = tmpPriceList.map((p) => p!);

          const prices: BigNumber[] = [];
          for (let i = 0; i < priceList.length; i++) {
            prices.push(bn(priceList[i]).sub(i > 0 ? priceList[i - 1] : 0));
          }

          const limit = pLimit(50);
          // Create a single tokenId order for every tokenId in the pool.
          await Promise.all(
            poolOwnedTokenIds.map((tokenId) =>
              limit(async () => {
                try {
                  const id = getOrderId(orderParams.pool, "sell", tokenId);

                  const orderResult = await redb.oneOrNone(
                    `
                      SELECT orders.raw_data
                      FROM orders
                      WHERE orders.id = $/id/
                    `,
                    { id }
                  );

                  // Handle fees and royalties
                  // For asks, we pass the exact tokenID as we're doing single
                  // ID listings
                  const royaltyRecipient = await getRoyaltyRecipient(
                    pool.nft,
                    bn(tokenId),
                    orderParams.royaltyRecipientFallback ??
                      orderResult?.raw_data?.royaltyRecipientFallback ??
                      AddressZero,
                    orderParams.assetRecipient ??
                      orderResult?.raw_data?.assetRecipient ??
                      AddressZero
                  );
                  const { feeBreakdown, totalFeeBps } = await getFeeBpsAndBreakdown(
                    poolContract,
                    royaltyRecipient,
                    id,
                    orderParams.feesModified
                  );
                  const { missingRoyaltyAmount, missingRoyalties } = await computeRoyaltyInfo(
                    pool.nft,
                    currencyPrice,
                    feeBreakdown.filter((fee) => fee.kind === "royalty")[0]?.bps ?? 0,
                    royaltyRecipient
                  );
                  const currencyNormalizedValue = bn(currencyValue).add(missingRoyaltyAmount);

                  // Handle price conversions to native currency
                  let price: BigNumber;
                  let value: BigNumber;
                  let normalizedValue: BigNumber;
                  try {
                    ({ price, value, normalizedValue } = await convertCurrencies(
                      pool.token,
                      currencyPrice,
                      currencyValue,
                      currencyNormalizedValue
                    ));
                  } catch (err) {
                    results.push({
                      id,
                      txHash: orderParams.txHash,
                      txTimestamp: orderParams.txTimestamp,
                      status: "failed-to-convert-price",
                    });
                    return;
                  }

                  // Order for this tokenId doesn't exist. Create new row.
                  if (!orderResult) {
                    const schemaHash = generateSchemaHash();
                    const [{ id: tokenSetId }] = await tokenSet.singleToken.save([
                      {
                        id: `token:${pool.nft}:${tokenId}`.toLowerCase(),
                        schemaHash,
                        contract: pool.nft,
                        tokenId,
                      },
                    ]);
                    if (!tokenSetId) {
                      throw new Error("No token set available");
                    }

                    if (
                      orderParams.assetRecipient === undefined ||
                      orderParams.royaltyRecipientFallback === undefined ||
                      orderParams.externalFilter === undefined
                    ) {
                      results.push({
                        id,
                        txHash: orderParams.txHash,
                        txTimestamp: orderParams.txTimestamp,
                        status: "missing-necessary-new-pool-info",
                      });
                      return;
                    }

                    // Handle: core sdk order
                    const sdkOrder: Sdk.CollectionXyz.Order = new Sdk.CollectionXyz.Order(
                      config.chainId,
                      {
                        pool: orderParams.pool,
                        externalFilter: orderParams.externalFilter,
                        tokenSetId: undefined,
                        assetRecipient: orderParams.assetRecipient,
                        royaltyRecipientFallback: orderParams.royaltyRecipientFallback,
                        extra: {
                          // Selling to pool -> Router needs expected output == currencyValue
                          prices: prices.map((p) => p.toString()),
                        },
                      }
                    );

                    // Handle: source
                    const sources = await Sources.getInstance();
                    const source = await sources.getOrInsert("collection.xyz");

                    const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
                    const validTo = `'Infinity'`;

                    orderValues.push({
                      id,
                      kind: "collectionxyz",
                      side: "sell",
                      fillability_status: "fillable",
                      approval_status: "approved",
                      token_set_id: tokenSetId,
                      token_set_schema_hash: toBuffer(schemaHash),
                      maker: toBuffer(pool.address),
                      taker: toBuffer(AddressZero),
                      price: price.toString(),
                      value: value.toString(),
                      currency: toBuffer(pool.token),
                      currency_price: currencyPrice.toString(),
                      currency_value: currencyValue.toString(),
                      needs_conversion: isERC20,
                      quantity_remaining: "1",
                      valid_between: `tstzrange(${validFrom}, ${validTo}, '[]')`,
                      nonce: null,
                      source_id_int: source?.id,
                      is_reservoir: null,
                      contract: toBuffer(pool.nft),
                      conduit: null,
                      fee_bps: Math.round(totalFeeBps),
                      fee_breakdown: feeBreakdown,
                      dynamic: null,
                      raw_data: sdkOrder.params,
                      expiration: validTo,
                      missing_royalties: missingRoyalties,
                      normalized_value: normalizedValue.toString(),
                      currency_normalized_value: currencyNormalizedValue.toString(),
                      block_number: orderParams.txBlock ?? null,
                      log_index: orderParams.logIndex ?? null,
                    });

                    results.push({
                      id,
                      txHash: orderParams.txHash,
                      txTimestamp: orderParams.txTimestamp,
                      status: "success",
                      triggerKind: "new-order",
                    });
                  } else {
                    // This is an order update, update the relevant row.
                    const sdkOrder: Sdk.CollectionXyz.Order = new Sdk.CollectionXyz.Order(
                      config.chainId,
                      orderResult.raw_data
                    );

                    sdkOrder.params.extra = {
                      // Router needs expected output == currencyValue
                      prices: prices.map((p) => p.toString()),
                    };
                    // tokenSetId is 1:1 with order id for asks
                    // sdkOrder.params.tokenSetId = tokenSetId;

                    if (orderParams.externalFilter !== undefined) {
                      sdkOrder.params.externalFilter = orderParams.externalFilter;
                    }

                    if (orderParams.assetRecipient !== undefined) {
                      sdkOrder.params.assetRecipient = orderParams.assetRecipient;
                    }

                    if (orderParams.assetRecipient !== undefined) {
                      sdkOrder.params.assetRecipient = orderParams.assetRecipient;
                    }

                    await idb.none(
                      `
                        UPDATE orders SET
                          fillability_status = 'fillable',
                          approval_status = 'approved',
                          price = $/price/,
                          currency_price = $/currencyPrice/,
                          value = $/value/,
                          currency_value = $/currencyValue/,
                          quantity_remaining = 1,
                          valid_between = tstzrange(date_trunc('seconds', to_timestamp(${orderParams.txTimestamp})), 'Infinity', '[]'),
                          expiration = 'Infinity',
                          updated_at = now(),
                          raw_data = $/rawData:json/,
                          missing_royalties = $/missingRoyalties:json/,
                          normalized_value = $/normalizedValue/,
                          currency_normalized_value = $/currencyNormalizedValue/,
                          fee_bps = $/feeBps/,
                          fee_breakdown = $/feeBreakdown:json/,
                          block_number = $/blockNumber/,
                          log_index = $/logIndex/
                        WHERE orders.id = $/id/
                          ${recheckCondition}
                      `,
                      {
                        id,
                        price: price.toString(),
                        currencyPrice: currencyPrice.toString(),
                        value: value.toString(),
                        currencyValue: currencyValue.toString(),
                        rawData: sdkOrder.params,
                        missingRoyalties: missingRoyalties,
                        normalizedValue: normalizedValue.toString(),
                        currencyNormalizedValue: currencyNormalizedValue.toString(),
                        feeBps: Math.round(totalFeeBps),
                        feeBreakdown: feeBreakdown,
                        blockNumber: orderParams.txBlock,
                        logIndex: orderParams.logIndex,
                      }
                    );

                    results.push({
                      id,
                      txHash: orderParams.txHash,
                      txTimestamp: orderParams.txTimestamp,
                      status: "success",
                      triggerKind: "reprice",
                    });
                  }
                } catch {
                  // Ignore any errors
                }
              })
            )
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        logger.error(
          "orders-collectionxyz-save",
          `Failed to handle sell order with params ${JSON.stringify(orderParams)}: ${error} (${
            error.stack
          })`
        );
      }
    } catch (error) {
      logger.error(
        "orders-collectionxyz-save",
        `Failed to handle order with params ${JSON.stringify(orderParams)}: ${error}`
      );
    }
  };

  // Process all orders concurrently
  const limit = pLimit(20);
  await Promise.all(orderInfos.map((orderInfo) => limit(() => handleOrder(orderInfo))));

  if (orderValues.length) {
    const columns = new pgp.helpers.ColumnSet(
      [
        "id",
        "kind",
        "side",
        "fillability_status",
        "approval_status",
        "token_set_id",
        "token_set_schema_hash",
        "maker",
        "taker",
        "price",
        "value",
        "currency",
        "currency_price",
        "currency_value",
        "needs_conversion",
        "quantity_remaining",
        { name: "valid_between", mod: ":raw" },
        "nonce",
        "source_id_int",
        "is_reservoir",
        "contract",
        "fee_bps",
        { name: "fee_breakdown", mod: ":json" },
        "dynamic",
        "raw_data",
        { name: "expiration", mod: ":raw" },
        { name: "missing_royalties", mod: ":json" },
        "normalized_value",
        "currency_normalized_value",
        "block_number",
        "log_index",
      ],
      {
        table: "orders",
      }
    );
    await idb.none(pgp.helpers.insert(orderValues, columns) + " ON CONFLICT DO NOTHING");
  }

  logger.info("collectionxyz-debug", JSON.stringify(results));

  await ordersUpdateById.addToQueue(
    results
      .filter(({ status }) => status === "success")
      .map(
        ({ id, txHash, txTimestamp, triggerKind }) =>
          ({
            context: `${triggerKind}-${id}-${txHash}`,
            id,
            trigger: {
              kind: triggerKind,
              txHash: txHash,
              txTimestamp: txTimestamp,
            },
          } as ordersUpdateById.OrderInfo)
      )
  );

  return results;
};
