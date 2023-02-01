import { HashZero } from "@ethersproject/constants";
import crypto from "crypto";
import stringify from "json-stable-stringify";

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
  target?: string;
  originatedAt?: string;
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
  raw_data: object | null;
  expiration: string;
  missing_royalties: object | null;
  normalized_value: string | null;
  currency_normalized_value: string | null;
  originated_at?: string | null;
  block_number?: number | null;
  log_index?: number | null;
};

const defaultSchemaHash = HashZero;
export const generateSchemaHash = (schema?: object) =>
  schema
    ? "0x" + crypto.createHash("sha256").update(stringify(schema)).digest("hex")
    : defaultSchemaHash;
