import { openseaMetadataProvider } from "@/metadata/providers/opensea-metadata-provider";

export const getTokensFlagStatusWithTokenIds = async (
  tokens: { contract: string; tokenId: string }[]
): Promise<{ contract: string; tokenId: string; isFlagged: boolean | null }[]> => {
  const result = await openseaMetadataProvider.getTokensMetadata(tokens, {
    isRequestForFlaggedMetadata: true,
  });

  const parsedResults = result.map((token) => ({
    contract: token.contract,
    tokenId: token.tokenId,
    isFlagged: token.flagged,
  }));

  return parsedResults;
};

export const getTokensFlagStatusForCollection = async (
  slug: string,
  contract: string,
  continuation: string | null
): Promise<{
  tokens: { contract: string; tokenId: string; isFlagged: boolean | null }[];
  nextContinuation: string | null;
}> => {
  let parsedTokens: { contract: string; tokenId: string; isFlagged: boolean | null }[] = [];
  let nextContinuation: string | null = null;
  if (slug) {
    const result = await openseaMetadataProvider.getTokensMetadataBySlug(slug, continuation || "");

    parsedTokens = result.metadata.map((token) => ({
      contract: token.contract,
      tokenId: token.tokenId,
      isFlagged: token.flagged,
    }));

    nextContinuation = result.continuation;
  } else if (contract) {
    const result = await openseaMetadataProvider._getTokensFlagStatusByContract(
      contract,
      continuation || ""
    );

    parsedTokens = result.data;
    nextContinuation = result.continuation;
  }

  return { tokens: parsedTokens, nextContinuation: nextContinuation || null };
};
