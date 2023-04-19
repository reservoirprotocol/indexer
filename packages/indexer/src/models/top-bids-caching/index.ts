import { redis } from "@/common/redis";
import { getNetworkSettings } from "@/config/network";
import { Collections } from "../collections";

/**
 * Class that manage redis cache of top bid value for collection
 */
class TopBidsCache {
  public key = "top-bids-caching";

  public async getCollectionTopBidValue(contract: string, tokenId: number): Promise<number | null> {
    let collectionTopBidValue;
    if (getNetworkSettings().multiCollectionContracts.includes(contract)) {
      const collection = await Collections.getByContractAndTokenId(contract, tokenId);

      collectionTopBidValue = await redis.get(`collection-top-bid:${collection?.id}`);

      if (collectionTopBidValue) {
        return Number(collectionTopBidValue);
      } else {
        return null;
      }
    }

    collectionTopBidValue = await redis.get(`collection-top-bid:${contract}`);

    if (collectionTopBidValue) {
      return Number(collectionTopBidValue);
    } else {
      return null;
    }
  }

  public async cacheCollectionTopBidValue(
    collectionId: string,
    value: number,
    expiry: number
  ): Promise<void> {
    await redis.set(`collection-top-bid:${collectionId}`, value, "EX", expiry);
  }

  public async clearCacheCollectionTopBidValue(collectionId: string): Promise<void> {
    await redis.del(`collection-top-bid:${collectionId}`);
  }
}

export const topBidsCache = new TopBidsCache();
