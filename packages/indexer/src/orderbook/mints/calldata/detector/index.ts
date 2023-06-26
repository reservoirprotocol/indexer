import { AddressZero } from "@ethersproject/constants";
import { formatEther } from "@ethersproject/units";

import { idb } from "@/common/db";
import { redis } from "@/common/redis";
import { bn, fromBuffer, toBuffer } from "@/common/utils";
import { getNetworkSettings } from "@/config/network";
import { fetchTransaction } from "@/events-sync/utils";
import * as mintsSupplyCheck from "@/jobs/mints/supply-check";
import { Sources } from "@/models/sources";

import * as generic from "@/orderbook/mints/calldata/detector/generic";
import * as manifold from "@/orderbook/mints/calldata/detector/manifold";
import * as seadrop from "@/orderbook/mints/calldata/detector/seadrop";
import * as thirdweb from "@/orderbook/mints/calldata/detector/thirdweb";
import * as zora from "@/orderbook/mints/calldata/detector/zora";

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
  const collectionsResult = await idb.manyOrNone(
    `
      SELECT
        tokens.collection_id
      FROM tokens
      WHERE tokens.contract = $/contract/
        AND tokens.token_id IN ($/tokenIds:list/)
    `,
    {
      contract: toBuffer(contract),
      tokenIds: transfers.map((t) => t.tokenId),
    }
  );
  if (!collectionsResult.length) {
    return [];
  }
  const collection = collectionsResult[0].collection_id;
  if (!collectionsResult.every((c) => c.collection_id && c.collection_id === collection)) {
    return [];
  }

  await mintsSupplyCheck.addToQueue(collection);

  // For performance reasons, do at most one attempt per collection per 5 minutes
  if (!skipCache) {
    const mintDetailsLockKey = `mint-details:${collection}`;
    const mintDetailsLock = await redis.get(mintDetailsLockKey);
    if (mintDetailsLock) {
      return [];
    }
    await redis.set(mintDetailsLockKey, "locked", "EX", 5 * 60);
  }

  // Make sure every mint in the transaction goes to the transaction sender
  const tx = await fetchTransaction(txHash);
  if (!transfers.every((t) => t.from === AddressZero && t.to === tx.from)) {
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

  // Allow at most a few decimals for the unit price
  const splittedPrice = formatEther(pricePerAmountMinted).split(".");
  if (splittedPrice.length > 1) {
    const numDecimals = splittedPrice[1].length;
    if (numDecimals > 7) {
      return [];
    }
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

  // Manifold
  const manifoldResults = await manifold.extractByTx(collection, tx);
  if (manifoldResults.length) {
    return manifoldResults;
  }

  // Zora
  const zoraResults = await zora.extractByTx(collection, tx);
  if (zoraResults.length) {
    return zoraResults;
  }

  // Seadrop
  const seadropResults = await seadrop.extractByTx(collection, contract, tx);
  if (seadropResults.length) {
    return seadropResults;
  }

  // Thirdweb
  const thirdwebResults = await thirdweb.extractByTx(collection, tx);
  if (thirdwebResults.length) {
    return thirdwebResults;
  }

  // Generic
  const genericResults = await generic.extractByTx(
    collection,
    contract,
    tx,
    pricePerAmountMinted,
    amountMinted
  );
  if (genericResults.length) {
    return genericResults;
  }

  return [];
};
