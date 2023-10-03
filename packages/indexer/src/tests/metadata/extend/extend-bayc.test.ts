import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import MetadataProviderRouter from "@/metadata/metadata-provider-router";

jest.setTimeout(1000 * 1000);

const tokens = [
  {
    contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
    tokenId: "1",
  },
];

describe("Extend - bayc", () => {
  it("getCollectionMetadata", async () => {
    const collectionMetadata = await MetadataProviderRouter.getCollectionMetadata(
      tokens[0].contract,
      tokens[0].tokenId
    );

    expect(collectionMetadata).toEqual(
      expect.objectContaining({
        id: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        slug: "boredapeyachtclub",
        name: "Bored Ape Yacht Club",
        community: null,
        metadata: {
          discordUrl: "https://discord.gg/3P5K3dzgdB",
          twitterUsername: "BoredApeYC",
          externalUrl: "http://www.boredapeyachtclub.com/",
          imageUrl:
            "https://i.seadn.io/gae/Ju9CkWtV-1Okvf45wo8UctR-M9He2PjILP0oOvxE89AyiPPGtrR3gysu1Zgy0hjd2xKIgjJJtWIc0ybj4Vd7wv8t3pxDGHoJBzDB?w=500&auto=format",
          bannerImageUrl:
            "https://i.seadn.io/gae/i5dYZRkVCUK97bfprQ3WXyrT9BnLSZtVKGJlKQ919uaUB0sxbngVCioaiyu9r6snqfi2aaTyIvv6DHm4m2R3y7hMajbsv14pSZK8mhs?w=500&auto=format",
          safelistRequestStatus: "verified",
          name: "Bored Ape Yacht Club",
          description:
            "The Bored Ape Yacht Club is a collection of 10,000 unique Bored Ape NFTs— unique digital collectibles living on the Ethereum blockchain. Your Bored Ape doubles as your Yacht Club membership card, and grants access to members-only benefits, the first of which is access to THE BATHROOM, a collaborative graffiti board. Future areas and perks can be unlocked by the community through roadmap activation. Visit www.BoredApeYachtClub.com for more details.",
        },
        openseaRoyalties: [{ recipient: "0xa858ddc0445d8131dac4d1de01f834ffcba52ef1", bps: 250 }],
        openseaFees: [{ recipient: "0x0000a26b00c1f0df003000390027140000faa719", bps: 250 }],
        contract: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        tokenIdRange: null,
        tokenSetId: "contract:0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d",
        paymentTokens: [
          {
            address: "0x0000000000000000000000000000000000000000",
            decimals: 18,
            name: "Ether",
            symbol: "ETH",
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
          {
            address: "0x4d224452801aced8b2f0aebe155379bb5d594381",
            decimals: 18,
            name: "ApeCoin",
            symbol: "APE",
          },
        ],
        creator: "0xaba7161a7fb69c88e16ed9f455ce62b791ee4d03",
      })
    );
  });

  it("getTokensMetadata", async () => {
    const tokenMetadata = await MetadataProviderRouter.getTokensMetadata(tokens);

    expect(tokenMetadata).toEqual(
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
