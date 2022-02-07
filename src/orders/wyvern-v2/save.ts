import * as Sdk from "@reservoir0x/sdk";
import { generateMerkleTree } from "@reservoir0x/sdk/dist/wyvern-v2/builders/token-list/utils";

import { bn } from "@/common/bignumber";
import { db, pgp } from "@/common/db";
import { config } from "@/config/index";
import { addPendingOrders, addPendingTokenSets } from "@/jobs/orders-relay";
import { addToOrdersUpdateByHashQueue } from "@/jobs/orders-update";
import {
  TokenSetInfo,
  TokenSetLabelKind,
  generateAttributeInfo,
  generateCollectionInfo,
  generateTokenInfo,
} from "@/orders/utils";
import { OrderInfo } from "@/orders/wyvern-v2";

type OrderMetadata = {
  kind: TokenSetLabelKind;
  data?: any;
};

const extractOrderMetadata = (
  order: Sdk.WyvernV2.Order
): OrderMetadata | undefined => {
  switch (order.params.kind) {
    case "erc721-single-token": {
      const builder = new Sdk.WyvernV2.Builders.Erc721.SingleToken(
        config.chainId
      );

      return {
        kind: "token",
        data: {
          tokenId: builder.getTokenId(order),
        },
      };
    }

    case "erc1155-single-token": {
      const builder = new Sdk.WyvernV2.Builders.Erc1155.SingleToken(
        config.chainId
      );

      return {
        kind: "token",
        data: {
          tokenId: builder.getTokenId(order),
        },
      };
    }

    case "erc721-token-range": {
      const builder = new Sdk.WyvernV2.Builders.Erc721.TokenRange(
        config.chainId
      );

      return {
        kind: "collection",
        data: {
          tokenIdRange: builder.getTokenIdRange(order),
        },
      };
    }

    case "erc1155-token-range": {
      const builder = new Sdk.WyvernV2.Builders.Erc1155.TokenRange(
        config.chainId
      );

      return {
        kind: "collection",
        data: {
          tokenIdRange: builder.getTokenIdRange(order),
        },
      };
    }

    case "erc721-contract-wide": {
      return {
        kind: "collection",
      };
    }

    case "erc1155-contract-wide": {
      return {
        kind: "collection",
      };
    }

    case "erc721-token-list": {
      const builder = new Sdk.WyvernV2.Builders.Erc721.TokenList(
        config.chainId
      );

      return {
        kind: "attribute",
        data: {
          merkleRoot: builder.getMerkleRoot(order),
        },
      };
    }

    case "erc1155-token-list": {
      const builder = new Sdk.WyvernV2.Builders.Erc1155.TokenList(
        config.chainId
      );

      return {
        kind: "attribute",
        data: {
          merkleRoot: builder.getMerkleRoot(order),
        },
      };
    }

    default: {
      return undefined;
    }
  }
};

type SaveResult = {
  valid: OrderInfo[];
  invalid: {
    orderInfo: OrderInfo;
    reason: string;
  }[];
};

export const saveOrders = async (
  orderInfos: OrderInfo[],
  relayToArweave = true
): Promise<SaveResult> => {
  const result: SaveResult = {
    valid: [],
    invalid: [],
  };

  if (!orderInfos.length) {
    return result;
  }

  // For Arweave relaying, we must keep track of the following:
  // - valid orders together with their associated schema hashes
  // - new token sets
  const arweaveOrderData: {
    order: Sdk.WyvernV2.Order;
    schemaHash?: string;
  }[] = [];
  const arweaveTokenSetData: {
    id: string;
    schema: any;
    contract: string;
    tokenIds: string[];
  }[] = [];

  const queries: any[] = [];
  for (const orderInfo of orderInfos) {
    const { order } = orderInfo;

    const orderMetadata = extractOrderMetadata(order);
    if (!orderMetadata) {
      result.invalid.push({ orderInfo, reason: "Order is invalid" });
      continue;
    }

    let tokenSetInfo: TokenSetInfo | undefined;
    switch (orderMetadata.kind) {
      // We have a single-token order
      case "token": {
        tokenSetInfo = generateTokenInfo(
          order.params.target,
          orderMetadata.data?.tokenId
        );

        arweaveOrderData.push({ order, schemaHash: tokenSetInfo.labelHash });

        // Create the token set
        queries.push({
          query: `
            insert into "token_sets" (
              "id",
              "contract",
              "token_id",
              "label",
              "label_hash",
              "metadata"
            ) values (
              $/tokenSetId/,
              $/contract/,
              $/tokenId/,
              $/tokenSetLabel/,
              $/tokenSetLabelHash/,
              (
                select
                  jsonb_build_object('collectionName', "c"."name", 'tokenName', "t"."name")
                from "tokens" "t"
                join "collections" "c"
                  on "t"."collection_id" = "c"."id"
                where "t"."contract" = $/contract/
                and "t"."token_id" = $/tokenId/
              )
            ) on conflict do nothing
          `,
          values: {
            tokenSetId: tokenSetInfo.id,
            contract: order.params.target,
            tokenId: orderMetadata.data.tokenId,
            tokenSetLabel: tokenSetInfo.label,
            tokenSetLabelHash: tokenSetInfo.labelHash,
          },
        });

        // For increased performance, only trigger the insertion of
        // corresponding tokens in the token set if we don't already
        // have them stored in the database
        const tokenSetTokensExists = await db.oneOrNone(
          `
            select 1
            from "token_sets_tokens" "tst"
            where "tst"."token_set_id" = $/tokenSetId/
            limit 1
          `,
          { tokenSetId: tokenSetInfo.id }
        );
        if (!tokenSetTokensExists) {
          // Insert matching tokens in the token set
          queries.push({
            query: `
              insert into "token_sets_tokens" (
                "token_set_id",
                "contract",
                "token_id"
              ) values (
                $/tokenSetId/,
                $/contract/,
                $/tokenId/
              ) on conflict do nothing
            `,
            values: {
              tokenSetId: tokenSetInfo.id,
              contract: order.params.target,
              tokenId: orderMetadata.data.tokenId,
            },
          });
        }

        break;
      }

      // We have a collection-wide order
      case "collection": {
        // Build the token set associated to the order
        const tokenSetId = orderMetadata.data?.tokenIdRange
          ? `range:${order.params.target}:${orderMetadata.data.tokenIdRange[0]}:${orderMetadata.data.tokenIdRange[1]}`
          : `contract:${order.params.target}`;

        // Fetch the collection that matches the token set
        const collection: { id: string } | null = await db.oneOrNone(
          `
            select
              "c"."id"
            from "collections" "c"
            where "c"."token_set_id" = $/tokenSetId/
          `,
          { tokenSetId }
        );

        if (collection) {
          tokenSetInfo = generateCollectionInfo(
            collection.id,
            order.params.target,
            orderMetadata.data?.tokenIdRange
          );

          arweaveOrderData.push({ order, schemaHash: tokenSetInfo.labelHash });

          // Create the token set
          queries.push({
            query: `
              insert into "token_sets" (
                "id",
                "collection_id",
                "label",
                "label_hash",
                "metadata"
              ) values (
                $/tokenSetId/,
                $/collectionId/,
                $/tokenSetLabel/,
                $/tokenSetLabelHash/,
                (
                  select
                    jsonb_build_object('collectionName', "c"."name")
                  from "collections" "c"
                  where "c"."id" = $/collectionId/
                )
              ) on conflict do nothing
            `,
            values: {
              tokenSetId: tokenSetInfo.id,
              collectionId: collection.id,
              tokenSetLabel: tokenSetInfo.label,
              tokenSetLabelHash: tokenSetInfo.labelHash,
            },
          });

          // For increased performance, only trigger the insertion of
          // corresponding tokens in the token set if we don't already
          // have them stored in the database
          const tokenSetTokensExists = await db.oneOrNone(
            `
              select 1
              from "token_sets_tokens" "tst"
              where "tst"."token_set_id" = $/tokenSetId/
              limit 1
            `,
            { tokenSetId: tokenSetInfo.id }
          );
          if (!tokenSetTokensExists) {
            // Insert matching tokens in the token set
            queries.push({
              query: `
                insert into "token_sets_tokens" (
                  "token_set_id",
                  "contract",
                  "token_id"
                )
                (
                  select
                    $/tokenSetId/,
                    "t"."contract",
                    "t"."token_id"
                  from "tokens" "t"
                  where "t"."collection_id" = $/collection/
                ) on conflict do nothing
              `,
              values: {
                tokenSetId: tokenSetInfo.id,
                collection: collection.id,
              },
            });
          }
        }

        break;
      }

      // We have an attribute order
      case "attribute": {
        // Fetch all tokens that match the order's attribute

        if (!orderInfo.attribute) {
          // Skip if the order was passed without any associated attribute
          break;
        }

        const collection: { token_set_id: string | null } | null =
          await db.oneOrNone(
            `
              select
                "c"."token_set_id"
              from "collections" "c"
              where "c"."id" = $/collection/
            `,
            {
              collection: orderInfo.attribute.collection,
            }
          );
        if (!collection?.token_set_id) {
          // Skip if the collection has no associated token set
          break;
        }

        let tokens: { contract: string; token_id: string }[] =
          await db.manyOrNone(
            `
              select
                "a"."contract",
                "a"."token_id"
              from "attributes" "a"
              where "a"."collection_id" = $/collection/
                and "a"."key" = $/key/
                and "a"."value" = $/value/
            `,
            {
              collection: orderInfo.attribute.collection,
              key: orderInfo.attribute.key,
              value: orderInfo.attribute.value,
            }
          );

        if (!tokens.length) {
          // No tokens matched the passed attribute
          break;
        }

        if (!tokens.every(({ contract }) => contract === order.params.target)) {
          // Make sure all matching tokens are on the same order target contract
          break;
        }

        const merkleTree = generateMerkleTree(
          tokens.map(({ token_id }) => token_id)
        );
        if (merkleTree.getHexRoot() !== orderMetadata.data?.merkleRoot) {
          // The order's merkle root doesn't match the attributes
          break;
        }

        tokenSetInfo = generateAttributeInfo(
          orderInfo.attribute,
          merkleTree.getHexRoot()
        );

        arweaveOrderData.push({
          order,
          schemaHash: tokenSetInfo.labelHash,
        });

        // Create the token set
        queries.push({
          query: `
            insert into "token_sets" (
              "id",
              "collection_id",
              "attribute_key",
              "attribute_value",
              "label",
              "label_hash",
              "metadata"
            ) values (
              $/tokenSetId/,
              $/collectionId/,
              $/attributeKey/,
              $/attributeValue/,
              $/tokenSetLabel/,
              $/tokenSetLabelHash/,
              (
                select
                  jsonb_build_object('collectionName', "c"."name")
                from "collections" "c"
                where "c"."id" = $/collectionId/
              )
            ) on conflict do nothing
          `,
          values: {
            tokenSetId: tokenSetInfo.id,
            collectionId: orderInfo.attribute.collection,
            attributeKey: orderInfo.attribute.key,
            attributeValue: orderInfo.attribute.value,
            tokenSetLabel: tokenSetInfo.label,
            tokenSetLabelHash: tokenSetInfo.labelHash,
          },
        });

        // For increased performance, only trigger the insertion of
        // corresponding tokens in the token set if we don't already
        // have them stored in the database
        const tokenSetTokensExists = await db.oneOrNone(
          `
            select 1
            from "token_sets_tokens" "tst"
            where "tst"."token_set_id" = $/tokenSetId/
            limit 1
          `,
          { tokenSetId: tokenSetInfo.id }
        );
        if (!tokenSetTokensExists) {
          arweaveTokenSetData.push({
            id: tokenSetInfo.id,
            schema: tokenSetInfo.label,
            contract: order.params.target,
            tokenIds: tokens.map(({ token_id }) => token_id),
          });

          // Insert matching tokens in the token set
          queries.push({
            query: `
              insert into "token_sets_tokens" (
                "token_set_id",
                "contract",
                "token_id"
              )
              (
                select
                  $/tokenSetId/,
                  "t"."contract",
                  "t"."token_id"
                from "tokens" "t"
                join "attributes" "a"
                  on "t"."contract" = "a"."contract"
                  and "t"."token_id" = "a"."token_id"
                where "t"."collection_id" = $/collection/
                  and "a"."key" = $/attributeKey/
                  and "a"."value" = $/attributeValue/
              ) on conflict do nothing
            `,
            values: {
              tokenSetId: tokenSetInfo.id,
              collection: orderInfo.attribute.collection,
              attributeKey: orderInfo.attribute.key,
              attributeValue: orderInfo.attribute.value,
            },
          });
        }

        break;
      }
    }

    if (!tokenSetInfo) {
      result.invalid.push({
        orderInfo,
        reason: "Order has no matching token set",
      });
      continue;
    }

    const side = order.params.side === 0 ? "buy" : "sell";

    let value: string;
    if (side === "buy") {
      // For buy orders, we set the value as `price - fee` since it's
      // best for UX to show the user exactly what they're going to
      // receive on offer acceptance (and that is `price - fee` and
      // not `price`)
      const fee = order.params.takerRelayerFee;
      value = bn(order.params.basePrice)
        .sub(bn(order.params.basePrice).mul(bn(fee)).div(10000))
        .toString();
    } else {
      // For sell orders, the value is the same as the price
      value = order.params.basePrice;
    }

    // Handle fees

    const feeBps = Math.max(
      order.params.makerRelayerFee,
      order.params.takerRelayerFee
    );

    let sourceInfo;
    switch (order.params.feeRecipient) {
      // OpenSea
      case "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073": {
        sourceInfo = {
          id: "opensea",
          bps: 250,
        };
        break;
      }

      // LootExchange
      case "0x8cfdf9e9f7ea8c0871025318407a6f1fbc5d5a18":
      case "0x8e71a0d2cc9c48173d9a9b7d90d6036093212afa": {
        sourceInfo = {
          id: "lootexchange",
          bps: 0,
        };
        break;
      }

      // Unknown
      default: {
        sourceInfo = {
          id: "unknown",
          // Assume everything goes to the order's fee recipient
          bps: feeBps,
        };
        break;
      }
    }

    // Handle royalties

    const royalty: { recipient: string } | null = await db.oneOrNone(
      `
        select
          "c"."royalty_recipient" as "recipient"
        from "collections" "c"
        join "tokens" "t"
          on "c"."id" = "t"."collection_id"
        where "t"."contract" = $/contract/
        limit 1
      `,
      { contract: order.params.target }
    );

    let royaltyInfo;
    if (royalty) {
      // Royalties are whatever is left after subtracting the marketplace fee
      const bps = feeBps - sourceInfo.bps;
      if (bps > 0) {
        royaltyInfo = [
          {
            recipient: royalty.recipient,
            bps: feeBps - sourceInfo.bps,
          },
        ];
      }
    }

    // TODO: Not at all critical, but multi-row inserts could
    // do here to get better insert performance when handling
    // multiple orders
    queries.push({
      query: `
        insert into "orders" (
          "hash",
          "kind",
          "status",
          "side",
          "token_set_id",
          "token_set_label_hash",
          "maker",
          "price",
          "value",
          "valid_between",
          "source_info",
          "royalty_info",
          "raw_data",
          "expiry",
          "created_at"
        ) values (
          $/hash/,
          $/kind/,
          $/status/,
          $/side/,
          $/tokenSetId/,
          $/tokenSetLabelHash/,
          $/maker/,
          $/price/,
          $/value/,
          tstzrange(date_trunc('seconds', to_timestamp($/listingTime/)), date_trunc('seconds', to_timestamp($/expirationTime/))),
          $/sourceInfo:json/,
          $/royaltyInfo:json/,
          $/rawData/,
          date_trunc('seconds', to_timestamp($/expirationTime/)),
          date_trunc('milliseconds', now())
        ) on conflict ("hash") do
        update set
          "side" = $/side/,
          "token_set_id" = $/tokenSetId/,
          "token_set_label_hash" = $/tokenSetLabelHash/,
          "maker" = $/maker/,
          "price" = $/price/,
          "value" = $/value/,
          "valid_between" = tstzrange(date_trunc('seconds', to_timestamp($/listingTime/)), date_trunc('seconds', to_timestamp($/expirationTime/))),
          "source_info" = $/sourceInfo:json/,
          "royalty_info" = $/royaltyInfo:json/,
          "raw_data" = $/rawData/,
          "expiry" = date_trunc('seconds', to_timestamp($/expirationTime/)),
          "created_at" = date_trunc('milliseconds', now())
      `,
      values: {
        hash: order.prefixHash(),
        kind: "wyvern-v2",
        status: "valid",
        side,
        tokenSetId: tokenSetInfo.id,
        tokenSetLabelHash: tokenSetInfo.labelHash,
        maker: order.params.maker,
        price: order.params.basePrice,
        value,
        listingTime: order.params.listingTime,
        expirationTime:
          order.params.expirationTime == 0
            ? "infinity"
            : order.params.expirationTime,
        sourceInfo,
        royaltyInfo,
        rawData: order.params,
      },
    });

    result.valid.push(orderInfo);
  }

  if (queries.length) {
    await db.none(pgp.helpers.concat(queries));
  }

  await addToOrdersUpdateByHashQueue(
    orderInfos.map(({ order }) => ({
      context: "save",
      hash: order.prefixHash(),
    }))
  );

  if (relayToArweave) {
    await addPendingOrders(arweaveOrderData);
    await addPendingTokenSets(arweaveTokenSetData);
  }

  return result;
};
