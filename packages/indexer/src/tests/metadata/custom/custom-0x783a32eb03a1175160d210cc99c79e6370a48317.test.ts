import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import MetadataProviderRouter from "@/metadata/metadata-provider-router";

jest.setTimeout(1000 * 1000);

const tokens = [
  {
    contract: "0x783a32eb03a1175160d210cc99c79e6370a48317",
    tokenId: "1",
  },
];

describe("Custom Copyright - 0x783a32eb03a1175160d210cc99c79e6370a48317", () => {
  it("getCollectionMetadata", async () => {
    const collection = await MetadataProviderRouter.getCollectionMetadata(
      tokens[0].contract,
      tokens[0].tokenId
    );
    expect(collection).toEqual(
      expect.objectContaining({
        community: null,
        contract: "0x783a32eb03a1175160d210cc99c79e6370a48317",
        id: "0x783a32eb03a1175160d210cc99c79e6370a48317",
        metadata: null,
        name: "0x783a32eb03a1175160d210cc99c79e6370a48317",
        openseaRoyalties: [],
        royalties: [],
        slug: "0x783a32eb03a1175160d210cc99c79e6370a48317",
        tokenIdRange: null,
        tokenSetId: "contract:0x783a32eb03a1175160d210cc99c79e6370a48317",
      })
    );
  });

  it("getTokensMetadata", async () => {
    const tokenMetadata = await MetadataProviderRouter.getTokensMetadata(tokens);

    expect(tokenMetadata).toEqual(
      expect.arrayContaining([
        {
          animationOriginalUrl: null,
          attributes: [],
          collection: "0x783a32eb03a1175160d210cc99c79e6370a48317",
          contract: "0x783a32eb03a1175160d210cc99c79e6370a48317",
          description: null,
          flagged: false,
          imageOriginalUrl: null,
          imageUrl: null,
          mediaUrl: null,
          metadataOriginalUrl: null,
          name: null,
          slug: "0x783a32eb03a1175160d210cc99c79e6370a48317",
          tokenId: undefined,
        },
      ])
    );
  });
});
