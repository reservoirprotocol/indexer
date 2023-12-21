import { AddressZero } from "@ethersproject/constants";

import { idb } from "@/common/db";
import { redis } from "@/common/redis";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { getNetworkSettings } from "@/config/network";
import { fetchTransaction } from "@/events-sync/utils";
import { mintsCheckJob } from "@/jobs/mints/mints-check-job";
import { mintsRefreshJob } from "@/jobs/mints/mints-refresh-job";
import { Sources } from "@/models/sources";
import { getCollectionMints } from "@/orderbook/mints";

import * as artblocks from "@/orderbook/mints/calldata/detector/artblocks";
import * as createdotfun from "@/orderbook/mints/calldata/detector/createdotfun";
import * as decent from "@/orderbook/mints/calldata/detector/decent";
import * as foundation from "@/orderbook/mints/calldata/detector/foundation";
import * as generic from "@/orderbook/mints/calldata/detector/generic";
import * as manifold from "@/orderbook/mints/calldata/detector/manifold";
import * as mintdotfun from "@/orderbook/mints/calldata/detector/mintdotfun";
import * as seadrop from "@/orderbook/mints/calldata/detector/seadrop";
import * as soundxyz from "@/orderbook/mints/calldata/detector/soundxyz";
import * as thirdweb from "@/orderbook/mints/calldata/detector/thirdweb";
import * as zora from "@/orderbook/mints/calldata/detector/zora";
import * as titlesxyz from "@/orderbook/mints/calldata/detector/titlesxyz";

export {
  artblocks,
  decent,
  foundation,
  generic,
  manifold,
  mintdotfun,
  seadrop,
  soundxyz,
  thirdweb,
  zora,
  createdotfun,
  titlesxyz,
};

export const extractByTx = async (txHash: string, skipCache = false) => {
  // Fetch all transfers associated to the transaction
  const transfers = await idb
    .manyOrNone(
      `
        SELECT
          nft_transfer_events.address,
          nft_transfer_events.token_id,
          nft_transfer_events.amount,
          nft_transfer_events.from,
          nft_transfer_events.to
        FROM nft_transfer_events
        WHERE nft_transfer_events.tx_hash = $/txHash/
      `,
      {
        txHash: toBuffer(txHash),
      }
    )
    .then((ts) =>
      ts.map((t) => ({
        contract: fromBuffer(t.address),
        tokenId: t.token_id,
        amount: t.amount,
        from: fromBuffer(t.from),
        to: fromBuffer(t.to),
      }))
    );

  // Return early if no transfers are available
  if (!transfers.length) {
    return [];
  }

  // Exclude certain contracts
  const contract = transfers[0].contract;
  if (getNetworkSettings().mintsAsSalesBlacklist.includes(contract)) {
    return [];
  }

  // Make sure every mint in the transaction is associated to the same contract
  if (!transfers.every((t) => t.contract === contract)) {
    return [];
  }

  // Make sure that every mint in the transaction is associated to the same collection
  const tokenIds = transfers.map((t) => t.tokenId);
  const collectionsResult = await idb.manyOrNone(
    `
      SELECT
        contracts.kind,
        tokens.collection_id
      FROM tokens
      JOIN contracts
        ON tokens.contract = contracts.address
      WHERE tokens.contract = $/contract/
        AND tokens.token_id IN ($/tokenIds:list/)
    `,
    {
      contract: toBuffer(contract),
      tokenIds,
    }
  );
  if (!collectionsResult.length) {
    return [];
  }
  const collection = collectionsResult[0].collection_id;
  if (!collectionsResult.every((c) => c.collection_id && c.collection_id === collection)) {
    return [];
  }

  await mintsCheckJob.addToQueue({ collection }, 10 * 60);

  // If there are any open collection mints trigger a refresh with a delay
  const openMints = await getCollectionMints(collection, { status: "open" });

  const hasOpenMints = openMints.length > 0;
  const forceRefresh = openMints.some((c) => c.details.info?.hasDynamicPrice);

  if (hasOpenMints) {
    await mintsRefreshJob.addToQueue({ collection, forceRefresh }, 10 * 60);
  }

  // For performance reasons, do at most one attempt per collection per 5 minutes
  if (!skipCache) {
    const kind = collectionsResult[0].kind;
    if (kind === "erc1155") {
      // For ERC1155, we use a lock per collection + token (since mints are usually per token)
      // For safety, restrict to first 10 tokens
      for (const tokenId of tokenIds.slice(0, 10)) {
        const mintDetailsLockKey = `mint-details:${collection}:${tokenId}`;
        const mintDetailsLock = await redis.get(mintDetailsLockKey);
        if (mintDetailsLock) {
          return [];
        }
        await redis.set(mintDetailsLockKey, "locked", "EX", 5 * 60);
      }
    } else {
      // For ERC721, we use a lock per collection only (since mints are per collection)
      const mintDetailsLockKey = `mint-details:${collection}`;
      const mintDetailsLock = await redis.get(mintDetailsLockKey);
      if (mintDetailsLock) {
        return [];
      }
      await redis.set(mintDetailsLockKey, "locked", "EX", 5 * 60);
    }
  }

  // Make sure every transfer in the transaction is a mint
  const tx = await fetchTransaction(txHash);
  if (!transfers.every((t) => t.from === AddressZero)) {
    return [];
  }

  // Make sure something was actually minted
  const amountMinted = transfers.map((t) => bn(t.amount)).reduce((a, b) => bn(a).add(b));
  if (amountMinted.eq(0)) {
    return [];
  }

  // Make sure the total price is evenly divisible by the amount
  const pricePerAmountMinted = bn(tx.value).div(amountMinted);
  if (!bn(tx.value).eq(pricePerAmountMinted.mul(amountMinted))) {
    return [];
  }

  // There must be some calldata
  if (tx.data.length < 10) {
    return [];
  }

  // Remove any source tags at the end of the calldata (`mint.fun` uses them)
  if (tx.data.length > 10) {
    const sources = await Sources.getInstance();
    const source = sources.getByDomainHash(tx.data.slice(-8));
    if (source) {
      tx.data = tx.data.slice(0, -8);
    }
  }

  // Artblocks
  const artblocksResults = await artblocks.extractByTx(collection, tx);
  if (artblocksResults.length) {
    return artblocksResults;
  }

  // Decent
  const decentResults = await decent.extractByTx(collection, tx);
  if (decentResults.length) {
    return decentResults;
  }

  // Foundation
  const foundationResults = await foundation.extractByTx(collection, tx);
  if (foundationResults.length) {
    return foundationResults;
  }

  // Manifold
  const manifoldResults = await manifold.extractByTx(collection, tx);
  if (manifoldResults.length) {
    return manifoldResults;
  }

  // Mintdotfun
  const mintdotfunResults = await mintdotfun.extractByTx(collection, tx);
  if (mintdotfunResults.length) {
    return mintdotfunResults;
  }

  // Zora
  const zoraResults = await zora.extractByTx(collection, tx);
  if (zoraResults.length) {
    return zoraResults;
  }

  // Seadrop
  const seadropResults = await seadrop.extractByTx(collection, tx);
  if (seadropResults.length) {
    return seadropResults;
  }

  // Thirdweb
  const thirdwebResults = await thirdweb.extractByTx(collection, tx);
  if (thirdwebResults.length) {
    return thirdwebResults;
  }

  // Soundxyz
  const soundxyzResults = await soundxyz.extractByTx(collection, tx);
  if (soundxyzResults.length) {
    return soundxyzResults;
  }

  // Createdotfun
  const createdotfunResults = await createdotfun.extractByTx(collection, tx);
  if (createdotfunResults.length) {
    return createdotfunResults;
  }

  // Titlesxyz
  const titlesXYZResults = await titlesxyz.extractByTx(collection, tx);
  if (titlesXYZResults.length) {
    return titlesXYZResults;
  }

  // Generic
  const genericResults = await generic.extractByTx(
    collection,
    tx,
    pricePerAmountMinted,
    amountMinted
  );
  if (genericResults.length) {
    return genericResults;
  }

  return [];
};
