import { HashZero } from "@ethersproject/constants";
import crypto from "crypto";
import stringify from "json-stable-stringify";

import { OrderKind } from "@/orderbook/orders";
import { TokenSetSchema } from "@/orderbook/token-sets/utils";

// The number of price points to keep track of for pool orders
export const POOL_ORDERS_MAX_PRICE_POINTS_COUNT = 50;

// Optional metadata associated to an order
export type OrderMetadata = {
  schema?: TokenSetSchema;
  schemaHash?: string;
  source?: string;
  target?: string;
  originatedAt?: string;
  fromOnChain?: boolean;
  permitId?: string;
  permitIndex?: number;
};

// Underlying database model for an order
export type DbOrder = {
  id: string;
  kind: OrderKind;
  side: "buy" | "sell";
  fillability_status: string;
  approval_status: string;
  token_set_id?: string | null;
  token_set_schema_hash?: Buffer | null;
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

// TODO: Move under `token-sets`
const defaultSchemaHash = HashZero;
export const generateSchemaHash = (schema?: object) =>
  schema
    ? "0x" + crypto.createHash("sha256").update(stringify(schema)).digest("hex")
    : defaultSchemaHash;
