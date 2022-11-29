import * as seaport from "@/events-sync/handlers/royalties/seaport";
import { Royalty } from "@/utils/royalties";
import * as es from "@/events-sync/storage";

const registry = new Map<string, RoyaltyAdapter>();

export type RoyaltyResult = {
  royalty_fee_bps: number;
  marketplace_fee_bps: number;
  royalty_fee_breakdown: Royalty[];
  marketplace_fee_breakdown: Royalty[];
  paid_full_royalty: boolean;
};

export interface RoyaltyAdapter {
  extractRoyalties(fillEvent: es.fills.Event): Promise<null | RoyaltyResult>;
}

registry.set("seaport", seaport as RoyaltyAdapter);
