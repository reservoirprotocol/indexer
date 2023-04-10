import { Interface } from "@ethersproject/abi";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { keccak256 } from "@ethersproject/solidity";
import * as Sdk from "@reservoir0x/sdk";
import pLimit from "p-limit";

import { idb, pgp, redb } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { bn, now, toBuffer } from "@/common/utils";
import { config } from "@/config/index";
import * as ordersUpdateById from "@/jobs/order-updates/by-id-queue";
import { Sources } from "@/models/sources";
import { DbOrder, OrderMetadata, generateSchemaHash } from "@/orderbook/orders/utils";
import * as tokenSet from "@/orderbook/token-sets";
import * as royalties from "@/utils/royalties";
import {
  CollectionPoolType,
  getCollectionPool,
  saveCollectionPool,
} from "@/models/collection-pools";
import { BigNumber, ethers } from "ethers";
import { TokenIDs } from "fummpel";
import { getUSDAndNativePrices } from "@/utils/prices";
import { generateMerkleTree } from "@reservoir0x/sdk/src/common/helpers/merkle";
import { TokenSet } from "@/orderbook/token-sets/token-list";

const factoryAddress = Sdk.Collection.Addresses.CollectionPoolFactory[config.chainId];

export type OrderInfo = {
  orderParams: {
    pool: string;
    // Should be undefined if the trigger was an event which should not change
    // the existing merkle root
    encodedTokenIds?: Uint8Array;
    // Validation parameters (for ensuring only the latest event is relevant)
    txHash: string;
    txTimestamp: number;
    txBlock: number;
    logIndex: number;
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
 */
const getFeeBpsAndBreakdown = async (
  poolContract: Contract,
  royaltyRecipient: string
): Promise<{
  feeBreakdown: {
    kind: string;
    recipient: string;
    bps: number;
  }[];
  totalFeeBps: number;
  royaltyBps: number;
  protocolBps: number;
  tradeBps: number;
  carryBps: number;
}> => {
  const [tradeBps, protocolBps, royaltyBps, carryBps] = (await poolContract.feeMultipliers()).map(
    (fee: BigNumber) => fee.toNumber() / 10
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
      recipient: factoryAddress,
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
  ];

  return { totalFeeBps, feeBreakdown, tradeBps, protocolBps, royaltyBps, carryBps };
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
  poolContract: Contract,
  nftContract: Contract,
  tokenId: BigNumber
): Promise<string> => {
  let erc2981Recipient = AddressZero;
  try {
    erc2981Recipient = (await nftContract.royaltyInfo(tokenId, bn(0))).receiver;
  } catch {
    // Leave as address(0)
  }

  return poolContract.getRoyaltyRecipient(erc2981Recipient);
};

/**
 * Get all missing default royalties as well as the sum of missing royalties if
 * a swap took place at a pre-fee price of `currencyPrice`.
 */
const computeRoyaltyInfo = async (
  nftContract: Contract,
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
    await royalties.getRoyaltiesByTokenSet(
      `contract:${nftContract.address}`.toLowerCase(),
      "default"
    )
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
const getPoolDetails = async (address: string) =>
  getCollectionPool(address).catch(async () => {
    if (Sdk.Collection.Addresses.CollectionPoolFactory[config.chainId]) {
      const poolIface = new Interface([
        "function nft() view returns (address)",
        "function token() view returns (address)",
        "function bondingCurve() view returns (address)",
        "function poolType() view returns (uint8)",
        "function poolVariant() view returns (uint8)",
      ]);

      try {
        const pool = new Contract(address, poolIface, baseProvider);

        const nft = (await pool.nft()).toLowerCase();
        const bondingCurve = (await pool.bondingCurve()).toLowerCase();
        const poolType = await pool.poolType();
        const poolVariant = await pool.poolVariant();
        const token = poolVariant > 1 ? (await pool.token()).toLowerCase() : AddressZero;

        const factory = new Contract(
          Sdk.Collection.Addresses.CollectionPoolFactory[config.chainId],
          new Interface([
            "function isPoolVariant(address potentialPool, PoolVariant variant) view returns (bool)",
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
      keccak256(["string", "address", "string"], ["collection", pool, side])
    : // Sell orders have multiple order ids per pool (one for each potential token id)
      keccak256(["string", "address", "string", "uint256"], ["collection", pool, side, tokenId]);

export const save = async (orderInfos: OrderInfo[]): Promise<SaveResult[]> => {
  const results: SaveResult[] = [];
  const orderValues: DbOrder[] = [];

  const handleOrder = async ({ orderParams }: OrderInfo) => {
    try {
      const pool = await getPoolDetails(orderParams.pool);
      if (!pool) {
        throw new Error("Could not fetch pool details");
      }

      const nftContract = new Contract(
        pool.nft,
        new Interface([
          `function royaltyInfo(uint256 tokenId, uint256 salePrice) view returns (
            address receiver,
            uint256 royaltyAmount
          )`,
          `function supportsInterface(bytes4 interfaceId) view returns (bool)`,
        ])
      );

      const poolContract = new Contract(
        pool.address,
        new Interface([
          `
            function getBuyNFTQuote(uint256) view returns (
              (uint128,uint128,bytes,bytes) newParams,
              uint256 totalAmount,
              uint256 inputAmount,
              (uint256,uint256,uint256[]) fees
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
          `feeMultipliers() view returns (
            (uint24,uint24,uint24,uint24)
          )`,
          `function getRoyaltyRecipient(address payable erc2981Recipient) view returns (address payable)`,
          `function getAllHeldIds() view returns (uint256[])`,
          `function tokenIDFilterRoot view returns (bytes32)`,
        ]),
        baseProvider
      );

      const isERC20 = pool.token !== Sdk.Common.Addresses.Eth[config.chainId];

      // Handle bids
      try {
        if ([CollectionPoolType.TOKEN, CollectionPoolType.TRADE].includes(pool.poolType)) {
          const tokenBalance: BigNumber = await poolContract.liquidity();

          const {
            totalAmount: currencyPrice,
            outputAmount: currencyValue,
          }: { totalAmount: BigNumber; outputAmount: BigNumber } =
            await poolContract.getSellNFTQuote(1);

          const id = getOrderId(orderParams.pool, "buy");
          if (tokenBalance.lt(currencyPrice)) {
            // Determine how many NFTs can be bought (though the price will
            // increase with each unit)
            let numBuyableNFTs = 0;
            // Hardcoded limit in case there's way too much liquidity
            while (numBuyableNFTs < 10) {
              const { totalAmount }: { totalAmount: BigNumber } =
                await poolContract.getSellNFTQuote(1);

              if (tokenBalance.lt(totalAmount)) {
                break;
              }

              numBuyableNFTs++;
            }

            // Handle royalties and fees
            // For bids, we can't predict which tokenID is going to be sold
            // into the pool so we just use tokenID 0.
            const royaltyRecipient = await getRoyaltyRecipient(poolContract, nftContract, bn(0));
            const { feeBreakdown, totalFeeBps, royaltyBps } = await getFeeBpsAndBreakdown(
              poolContract,
              royaltyRecipient
            );
            const { missingRoyaltyAmount, missingRoyalties } = await computeRoyaltyInfo(
              nftContract,
              currencyPrice,
              royaltyBps,
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

            // Prepare raw order data
            const sdkOrder: Sdk.Collection.Order = new Sdk.Collection.Order(config.chainId, {
              pool: orderParams.pool,
            });

            // Check if this is new order or update
            const orderResult = await idb.oneOrNone(
              `
                SELECT
                  orders.token_set_id,
                  orders.token_set_schema_hash
                FROM orders
                WHERE orders.id = $/id/
              `,
              { id }
            );

            // If there's an existing order, first hold onto existing values.
            // If the orderParams passes encodedTokenIds, then it should mutate
            // these columns.
            let tokenSetId = orderResult?.token_set_id;
            let schemaHash = orderResult?.token_set_schema_hash;
            // Check if there's encodedTokenIds to process. If not, just don't
            // change the values existing in DB.
            if (orderParams.encodedTokenIds !== undefined) {
              const isFiltered =
                (await poolContract.tokenIDFilterRoot()) === ethers.constants.HashZero;

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
                const acceptedSet = TokenIDs.decode(orderParams.encodedTokenIds)
                  .tokens()
                  .map((bi) => BigNumber.from(bi));

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
                await tokenSet.tokenList.save([
                  {
                    // This must === `list:${pool.nft}:${generateMerkleTree(acceptedSet).getHexRoot()}`
                    // in the TokenSet.isValid() function
                    id: tokenSetId,
                    schema,
                    schemaHash,
                    items: {
                      contract: pool.nft,
                      // This stores all tokenIds which are known to belong to this merkle tree
                      tokenIds: acceptedSet.map((bn) => bn.toString()),
                    },
                  } as TokenSet,
                ]);
              }
            }

            // By this point, there should be a valid token set id and schema
            // hash for the order to be defined
            if (tokenSetId === undefined || schemaHash === undefined) {
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
              // Handle: source
              const sources = await Sources.getInstance();
              const source = await sources.getOrInsert("collection.xyz");

              const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
              const validTo = `'Infinity'`;

              await poolContract.orderValues.push({
                id,
                kind: "collection",
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
                quantity_remaining: numBuyableNFTs.toString(),
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
                    token_set_id = $/tokenSetId/,
                    token_set_schema_hash = $/schemaHash/
                  WHERE orders.id = $/id/
                    AND lower(orders.valid_between) < to_timestamp(${orderParams.txTimestamp})
                `,
                {
                  id,
                  price: price.toString(),
                  currencyPrice: currencyPrice.toString(),
                  value: value.toString(),
                  currencyValue: currencyValue.toString(),
                  rawData: sdkOrder.params,
                  quantityRemaining: numBuyableNFTs.toString(),
                  missingRoyalties: missingRoyalties,
                  normalizedValue: normalizedValue.toString(),
                  currencyNormalizedValue: currencyNormalizedValue.toString(),
                  feeBps: Math.round(totalFeeBps),
                  feeBreakdown: feeBreakdown,
                  blockNumber: orderParams.txBlock,
                  logIndex: orderParams.logIndex,
                  tokenSetId,
                  schemaHash: toBuffer(schemaHash),
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
            // The pool didn't have balance to fulfill the order. Update order
            // status
            await idb.none(
              `
                UPDATE orders SET
                  fillability_status = 'no-balance',
                  expiration = to_timestamp(${orderParams.txTimestamp}),
                  updated_at = now()
                WHERE orders.id = $/id/
                  AND lower(orders.valid_between) < to_timestamp(${orderParams.txTimestamp})
              `,
              { id }
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
      } catch (error) {
        logger.error(
          "orders-collection-save",
          `Failed to handle buy order with params ${JSON.stringify(orderParams)}: ${error}`
        );
      }

      // Handle sell orders
      try {
        if ([CollectionPoolType.NFT, CollectionPoolType.TRADE].includes(pool.poolType)) {
          const {
            totalAmount: currencyPrice,
            inputAmount: currencyValue,
          }: { totalAmount: BigNumber; inputAmount: BigNumber } = await poolContract.getBuyNFTQuote(
            1
          );

          // Fetch all token ids owned by the pool
          const poolOwnedTokenIds = ((await poolContract.getAllHeldIds()) as BigNumber[]).map(
            (bn) => bn.toString()
          );

          const limit = pLimit(50);
          // Create a single tokenId order for every tokenId in the pool.
          await Promise.all(
            poolOwnedTokenIds.map((tokenId) =>
              limit(async () => {
                try {
                  const id = getOrderId(orderParams.pool, "sell", tokenId);

                  // Handle fees and royalties
                  // For asks, we pass the exact tokenID as we're doing single
                  // ID listings
                  const royaltyRecipient = await getRoyaltyRecipient(
                    poolContract,
                    nftContract,
                    bn(tokenId)
                  );
                  const { feeBreakdown, totalFeeBps, royaltyBps } = await getFeeBpsAndBreakdown(
                    poolContract,
                    royaltyRecipient
                  );
                  const { missingRoyaltyAmount, missingRoyalties } = await computeRoyaltyInfo(
                    nftContract,
                    currencyPrice,
                    royaltyBps,
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

                  // Handle: core sdk order
                  const sdkOrder: Sdk.Collection.Order = new Sdk.Collection.Order(config.chainId, {
                    pool: orderParams.pool,
                  });

                  const orderResult = await redb.oneOrNone(
                    `
                      SELECT 1 FROM orders
                      WHERE orders.id = $/id/
                    `,
                    { id }
                  );

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

                    // Handle: source
                    const sources = await Sources.getInstance();
                    const source = await sources.getOrInsert("collection.xyz");

                    const validFrom = `date_trunc('seconds', to_timestamp(${orderParams.txTimestamp}))`;
                    const validTo = `'Infinity'`;

                    orderValues.push({
                      id,
                      kind: "collection",
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
                          AND lower(orders.valid_between) < to_timestamp(${orderParams.txTimestamp})
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
      } catch (error) {
        logger.error(
          "orders-collection-save",
          `Failed to handle sell order with params ${JSON.stringify(orderParams)}: ${error}`
        );
      }
    } catch (error) {
      logger.error(
        "orders-collection-save",
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
