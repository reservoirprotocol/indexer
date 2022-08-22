import { HashZero } from "@ethersproject/constants";
import crypto from "crypto";
import stringify from "json-stable-stringify";

import { Sources } from "@/models/sources";
import { SourcesEntity } from "@/models/sources/sources-entity";
import { OrderKind } from "@/orderbook/orders";

// Optional metadata associated to an order
export type OrderMetadata = {
  // For now, only attribute orders will have an associated schema.
  // The other order kinds only have a single possible schema that
  // can be attached to them:
  // - single-token -> order on a single token
  // - token-range / contract-wide -> order on a full collection
  schema?: {
    kind: "attribute";
    data: {
      collection: string;
      attributes: [
        {
          key: string;
          value: string;
        }
      ];
    };
  };
  schemaHash?: string;
  source?: string;
};

// Underlying database model for an order
export type DbOrder = {
  id: string;
  kind: OrderKind;
  side: "buy" | "sell" | "bundle";
  fillability_status: string;
  approval_status: string;
  token_set_id?: string | null;
  token_set_schema_hash?: Buffer | null;
  offer_bundle_id?: string | null;
  consideration_bundle_id?: string | null;
  bundle_kind?: "bundle-ask" | null;
  maker: Buffer;
  taker: Buffer;
  price: string;
  value: string;
  currency?: Buffer;
  currency_price: string;
  currency_value: string;
  quantity_remaining?: string;
  valid_between: string;
  nonce: string | null;
  source_id_int?: number;
  is_reservoir?: boolean | null;
  contract?: Buffer | null;
  conduit: Buffer | null;
  fee_bps: number;
  fee_breakdown?: object | null;
  dynamic?: boolean | null;
  needs_conversion: boolean | null;
  raw_data: object;
  expiration: string;
};

const defaultSchemaHash = HashZero;
export const generateSchemaHash = (schema?: object) =>
  schema
    ? "0x" + crypto.createHash("sha256").update(stringify(schema)).digest("hex")
    : defaultSchemaHash;

// In case we don't have the source of an order readily available, we use
// a default value where possible (since very often the exchange protocol
// is tightly coupled to a source marketplace and we just assume that the
// bulk of orders from a protocol come from known that marketplace).
export const getOrderSourceByOrderKind = async (
  orderKind: OrderKind
): Promise<SourcesEntity | null> => {
  try {
    const sources = await Sources.getInstance();

    switch (orderKind) {
      case "x2y2":
        return sources.getOrInsert("x2y2.io");
      case "foundation":
        return sources.getOrInsert("foundation.app");
      case "looks-rare":
        return sources.getOrInsert("looksrare.org");
      case "seaport":
      case "wyvern-v2":
      case "wyvern-v2.3":
        return sources.getOrInsert("opensea.io");
      case "rarible":
        return sources.getOrInsert("rarible.com");
      case "element-erc721":
      case "element-erc1155":
        return sources.getOrInsert("element.market");
      case "quixotic":
        return sources.getOrInsert("quixotic.io");
      case "nouns":
        return sources.getOrInsert("nouns.wtf");
      default:
        // For all other order kinds we cannot default the source
        return null;
    }
  } catch (error) {
    return null;
  }
};
