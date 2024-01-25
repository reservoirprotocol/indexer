import { hasExtendCollectionHandler } from "@/metadata/extend";
import { openseaMetadataProvider } from "@/metadata/providers/opensea-metadata-provider";
import { CollectionNotFoundError } from "@/metadata/providers/utils";
import { collectionMetadataQueueJob } from "../collection-updates/collection-metadata-queue-job";
import { Tokens } from "@/models/tokens";
import { PendingFlagStatusSyncContracts } from "@/models/pending-flag-status-sync-contracts";
import { logger } from "@/common/logger";

export const getTokenFlagStatus = async (
  contract: string,
  tokenId: string
): Promise<{ contract: string; tokenId: string; isFlagged: boolean }> => {
  const result = await openseaMetadataProvider._getTokenFlagStatus(contract, tokenId);

  return result.data;
};

export const getTokensFlagStatusForCollectionBySlug = async (
  slug: string,
  contract: string,
  collectionId: string,
  continuation: string | null
): Promise<{
  tokens: { contract: string; tokenId: string; isFlagged: boolean | null }[];
  nextContinuation: string | null;
}> => {
  let parsedTokens: { contract: string; tokenId: string; isFlagged: boolean | null }[] = [];
  let nextContinuation: string | null = null;
  let result: {
    data: { contract: string; tokenId: string; isFlagged: boolean }[];
    continuation: string | null;
  } = { data: [], continuation: null };
  try {
    result = await openseaMetadataProvider._getTokensFlagStatusByCollectionPaginationViaSlug(
      slug,
      continuation || ""
    );

    parsedTokens = result.data;
    nextContinuation = result.continuation;
  } catch (error) {
    logger.error(
      "getTokensFlagStatusForCollectionBySlug",
      JSON.stringify({
        message: `_getTokensFlagStatusByCollectionPaginationViaSlug error. contract:${contract}, continuation:${continuation}, error:${error}`,
        error,
      })
    );

    if (error instanceof CollectionNotFoundError && contract) {
      // refresh the collection slug, ours might be wrong.

      const tokenId = await Tokens.getSingleToken(collectionId);
      if (!tokenId) throw "Collection has no tokens: " + collectionId;

      await collectionMetadataQueueJob.addToQueue({
        contract: contract,
        tokenId: tokenId,
      });

      // slug is wrong, try to get the collection only based on the contract if its not a shared collection
      if (!hasExtendCollectionHandler(contract)) {
        await PendingFlagStatusSyncContracts.add(
          [
            {
              contract: contract,
              collectionId: collectionId,
              continuation: nextContinuation,
            },
          ],
          true
        );
        return { tokens: [], nextContinuation: null };
      } else {
        // if its a shared collection, we need to only refresh the tokens that are in the collection
        logger.info(
          "getTokensFlagStatusForCollectionBySlug",
          "Shared collection, not refreshing tokens"
        );

        return { tokens: [], nextContinuation: null };
      }
    } else throw error;
  }
  return { tokens: parsedTokens, nextContinuation: nextContinuation || null };
};

export const getTokensFlagStatusForCollectionByContract = async (
  contract: string,
  continuation: string | null
): Promise<{
  tokens: { contract: string; tokenId: string; isFlagged: boolean | null }[];
  nextContinuation: string | null;
}> => {
  let parsedTokens: { contract: string; tokenId: string; isFlagged: boolean | null }[] = [];
  let nextContinuation: string | null = null;
  let result: {
    data: { contract: string; tokenId: string; isFlagged: boolean }[];
    continuation: string | null;
  } = { data: [], continuation: null };

  if (!hasExtendCollectionHandler(contract)) {
    result = await openseaMetadataProvider._getTokensFlagStatusByCollectionPaginationViaContract(
      contract,
      continuation || ""
    );
  } else {
    // if its a shared collection, we need to only refresh the tokens that are in the collection
    // for now, just log that we are refreshing all tokens
    logger.info(
      "getTokensFlagStatusForCollectionByContract",
      `Shared contract, stopping processing for now. contract=${contract}`
    );

    return { tokens: [], nextContinuation: null };
  }

  parsedTokens = result.data;
  nextContinuation = result.continuation;

  return { tokens: parsedTokens, nextContinuation: nextContinuation || null };
};
