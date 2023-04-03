import _ from "lodash";
import { redis } from "@/common/redis";

export type PendingRefreshOpenseaCollectionOffersCollection = {
  slug: string;
  contract: string;
  collection: string;
};

/**
 * Class that manage redis list of tokens, pending metadata refresh
 */
export class PendingRefreshOpenseaCollectionOffersCollections {
  public key = "pending-refresh-opensea-collection-offers-collections";

  public async add(
    pendingRefreshOpenseaCollectionOffersCollections: PendingRefreshOpenseaCollectionOffersCollection[],
    prioritized = false
  ) {
    if (prioritized) {
      return await redis.lpush(
        this.key,
        _.map(
          pendingRefreshOpenseaCollectionOffersCollections,
          (pendingRefreshOpenseaCollectionOffersCollection) =>
            JSON.stringify(pendingRefreshOpenseaCollectionOffersCollection)
        )
      );
    } else {
      return await redis.rpush(
        this.key,
        _.map(
          pendingRefreshOpenseaCollectionOffersCollections,
          (pendingRefreshOpenseaCollectionOffersCollection) =>
            JSON.stringify(pendingRefreshOpenseaCollectionOffersCollection)
        )
      );
    }
  }

  public async get(count = 1): Promise<PendingRefreshOpenseaCollectionOffersCollection[]> {
    const pendingRefreshOpenseaCollectionOffersCollections = await redis.lpop(this.key, count);
    if (pendingRefreshOpenseaCollectionOffersCollections) {
      return _.map(
        pendingRefreshOpenseaCollectionOffersCollections,
        (pendingRefreshOpenseaCollectionOffersCollection) =>
          JSON.parse(
            pendingRefreshOpenseaCollectionOffersCollection
          ) as PendingRefreshOpenseaCollectionOffersCollection
      );
    }

    return [];
  }
}
