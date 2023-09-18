import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import MetadataProviderRouter from "@/metadata/metadata-provider-router";

jest.setTimeout(1000 * 1000);

describe("Custom Copyright - 0x783a32eb03a1175160d210cc99c79e6370a48317", () => {
  it("getCollectionMetadata", async () => {
    const collection = await MetadataProviderRouter.getCollectionMetadata(
      "0x783a32eb03a1175160d210cc99c79e6370a48317",
      "1"
    );
    expect(collection).toEqual(
      expect.arrayContaining([
        {
          contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
          tokenId: "1",
          collection: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
          slug: "boredapeyachtclub",
          name: null,
          flagged: false,
          description: null,
          imageUrl:
            "https://i.seadn.io/gae/9WkSu8CP7gZjaEmUy8cpaKG3mK6ScHeEDvQf8driDoRxuxy4GPAs_W_Dn_DQascQSGDkdUL4cjmsnRrL6xN-NDp-s_RNwN5pxiCo?w=500&auto=format",
          imageOriginalUrl:
            "https://opensea-private.mypinata.cloud/ipfs/QmPbxeGcXhYQQNgsC6a36dDyYUcHgMLnGKnF8pVFmGsvqi",
          animationOriginalUrl: null,
          metadataOriginalUrl: "ipfs://QmeSjSinHpPnmXmspMjwiXyN6zS4E9zccariGR3jxcaWtq/1",
          mediaUrl: null,
          attributes: [
            {
              key: "Mouth",
              value: "Grin",
              kind: "string",
              rank: 1,
            },
            {
              key: "Background",
              value: "Orange",
              kind: "string",
              rank: 1,
            },
            {
              key: "Eyes",
              value: "Blue Beams",
              kind: "string",
              rank: 1,
            },
            {
              key: "Fur",
              value: "Robot",
              kind: "string",
              rank: 1,
            },
            {
              key: "Clothes",
              value: "Vietnam Jacket",
              kind: "string",
              rank: 1,
            },
            {
              key: "Trait Count",
              value: 5,
              kind: "string",
            },
            {
              key: "ApeCoin Staked",
              value: "0 - 1 ApeCoin",
              kind: "string",
            },
          ],
        },
      ])
    );
  });
});
