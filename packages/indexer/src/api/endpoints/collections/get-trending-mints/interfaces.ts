/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Mint {
  collection_id: string;
  kind: string;
  status: string;
  mint_stages: {
    stage: string;
    tokenId: number;
    kind: string;
    currency: string;
    price: string;
    startTime: null;
    endTime: null;
    maxMintsPerWallet: number;
  }[];
  details: {
    tx: {
      to: string;
      data: {
        params: {
          kind: string;
          abiType: string;
        }[];
        signature: string;
      };
    };
  };
  currency: {
    type: string;
    data: number[];
  };
  price: string;
  stage: string;
  max_mints_per_wallet: number;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
  max_supply: string;
  token_id: string;
  allowlist_id: string;
  id: string;
}

export interface Metadata {
  id: string;
  day1_volume: number;
  day7_volume: number;
  day30_volume: number;
  on_sale_count: number;
  name: string;
  is_spam: number | null;
  contract: {
    type: string;
    data: number[];
  };
  mint_stages: {
    stage: string;
    tokenId: number;
    kind: string;
    currency: string;
    price: string;
    startTime: null;
    endTime: null;
    maxMintsPerWallet: number;
  }[];
  creator: string;
  token_count: number;
  owner_count: number;
  day1_volume_change: unknown;
  day7_volume_change: unknown;
  day30_volume_change: unknown;
  all_time_volume: string;
  metadata: {
    imageUrl: string;
    bannerImageUrl: string;
    description: string;
  };
  non_flagged_floor_sell_id: string;
  non_flagged_floor_sell_value: string;
  non_flagged_floor_sell_maker: {
    type: string;
    data: number[];
  };
  non_flagged_floor_sell_valid_between: string;
  non_flagged_floor_sell_source_id_int: number;
  floor_sell_id: string;
  floor_sell_value: string;
  floor_sell_maker: {
    type: string;
    data: number[];
  };
  floor_sell_valid_between: string;
  floor_sell_source_id_int: number;
  normalized_floor_sell_id: string;
  normalized_floor_sell_value: string;
  normalized_floor_sell_maker: {
    type: string;
    data: number[];
  };
  normalized_floor_sell_valid_between: string;
  normalized_floor_sell_source_id_int: number;
  top_buy_id: string;
  top_buy_value: string;
  top_buy_maker: string;
  top_buy_valid_between: any;
  top_buy_source_id_int: any;
}

export interface ElasticMintResult {
  volume: number;
  count: number;
  id: string;
}

export type MetadataKey = keyof Metadata;
