import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import MetadataProviderRouter from "@/metadata/metadata-provider-router";

jest.setTimeout(1000 * 1000);

const tokens = [
  {
    contract: "0x3b3ee1931dc30c1957379fac9aba94d1c48a5405",
    tokenId: "1",
  },
];

describe("Extend - foundation", () => {
  it("getCollectionMetadata", async () => {
    const collectionMetadata = await MetadataProviderRouter.getCollectionMetadata(
      tokens[0].contract,
      tokens[0].tokenId
    );

    expect(collectionMetadata).toEqual(
      expect.objectContaining({
        id: "0x3b3ee1931dc30c1957379fac9aba94d1c48a5405:foundation-shared-0xcF0949bf6d2aDF8032260Fd08039c879CF71c128",
        slug: "fnd",
        name: "Foundation",
        community: null,
        metadata: {
          discordUrl: null,
          twitterUsername: null,
          externalUrl: "https://foundation.app/",
          imageUrl:
            "https://i.seadn.io/gae/L87ncqbX2fgXIiy3bzsBZo7-HEtt7V9XVGXzfxoF-Z-DZR_qC65uIdCzdx_3jJWfIaKn4RNCvjo3RYoYHIXFE-Cq_eMHDvw8IFx0-y0?w=500&auto=format",
          bannerImageUrl:
            "https://i.seadn.io/gae/wdFMG3IxRznv0q786ZyuIj_H6qz0lsfEtW050sB5NKNlXfSbD3h2xNKjr2PVwEhF5ORyJ48lNZuQC6ggIAiBpxxguH8rEYxNmbXQcg?w=500&auto=format",
          safelistRequestStatus: "verified",
          name: "Foundation (FND)",
          description:
            "Foundation is building the new creative economy. Create, explore & collect digital art NFTs.",
        },
        openseaRoyalties: [],
        openseaFees: [{ recipient: "0x0000a26b00c1f0df003000390027140000faa719", bps: 250 }],
        contract: "0x3b3ee1931dc30c1957379fac9aba94d1c48a5405",
        tokenIdRange: null,
        tokenSetId: "contract:0x3b3ee1931dc30c1957379fac9aba94d1c48a5405",
        paymentTokens: [
          {
            address: "0x0000000000000000000000000000000000000000",
            decimals: 18,
            name: "Ether",
            symbol: "ETH",
          },
          {
            address: "0x6b175474e89094c44da98b954eedeac495271d0f",
            decimals: 18,
            name: "Dai Stablecoin",
            symbol: "DAI",
          },
          {
            address: "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
            decimals: 18,
            name: "Wrapped Ether",
            symbol: "WETH",
          },
          {
            address: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
            decimals: 6,
            name: "USD Coin",
            symbol: "USDC",
          },
        ],
        creator: "0xcF0949bf6d2aDF8032260Fd08039c879CF71c128",
      })
    );
  });

  it("getTokensMetadata", async () => {
    const tokenMetadata = await MetadataProviderRouter.getTokensMetadata(tokens);

    expect(tokenMetadata).toEqual(
      expect.arrayContaining([
        {
          contract: "0x3b3ee1931dc30c1957379fac9aba94d1c48a5405",
          tokenId: "1",
          collection:
            "0x3b3ee1931dc30c1957379fac9aba94d1c48a5405:foundation-shared-0xcF0949bf6d2aDF8032260Fd08039c879CF71c128",
          slug: "fnd",
          name: "Ancient Future",
          flagged: false,
          description:
            "Here at the nexus of infinity, we inscribe ourselves upon the sacred discs. For We are the Ancients of a Future Civilization. \n\nSingle Edition VHS Text Art by Sarah Zucker, 2020. Created in studio with Hi8 Camcorder Title Feedback, digital animation and analog processing on VHS. Filmed in 4K from vintage CRT TV screen.",
          imageUrl:
            "https://i.seadn.io/gae/_WC5fifI4aTtzzug2-pMTpy3CI_gsmOq1AmJZmfX08kUIU2THiNOcrKrPnat6SBgPsRyY_zjvga1V3CJwvyZuana8O0H3qR9FUrjxw?w=500&auto=format",
          imageOriginalUrl:
            "http://d2ybmb80bbm9ts.cloudfront.net/iu/Ti/QmXRmfvvenqr4eJ62vjxvYqc5eWp6i2MjpkTh9VZcLiuTi/nft.gif",
          animationOriginalUrl: "ipfs://QmXRmfvvenqr4eJ62vjxvYqc5eWp6i2MjpkTh9VZcLiuTi/nft.mp4",
          metadataOriginalUrl: "https://api.foundation.app/opensea/1",
          mediaUrl: "https://openseauserdata.com/files/350e50ed094266c09b6656dd403a5a75.mp4",
          attributes: [],
        },
      ])
    );
  });
});
