import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import MetadataProviderRouter from "@/metadata/metadata-provider-router";

jest.setTimeout(1000 * 1000);

const tokens = [
  {
    contract: "0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0",
    tokenId: "12345",
  },
];

describe("Extend - superrare", () => {
  it("getCollectionMetadata", async () => {
    const collectionMetadata = await MetadataProviderRouter.getCollectionMetadata(
      tokens[0].contract,
      tokens[0].tokenId
    );

    expect(collectionMetadata).toEqual(
      expect.objectContaining({
        id: "0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0:superrare-shared-0xb0c6596d32b90d390077f7af7dcC97FfCBD5BdE0",
        slug: "superrare",
        name: "SuperRare 1/1s: Marterium",
        community: null,
        metadata: {
          discordUrl: "https://discord.gg/superraredao",
          twitterUsername: "superrare",
          externalUrl: "https://superrare.co",
          imageUrl:
            "https://i.seadn.io/gae/-1VbTF_qOdwTUTxW8KzJbFcMX0-mDF-BJM-gmmRl8ihvoo53PF_1z1m1snLXxwcxVFyJH7wk_kouq-KVyB55N9U?w=500&auto=format",
          bannerImageUrl:
            "https://i.seadn.io/gcs/static/banners/superrare-banner5.png?w=500&auto=format",
          safelistRequestStatus: "verified",
          name: "SuperRare",
          description:
            "SuperRare makes it easy to create, sell, and collect rare digital art. SuperRare's smart contract platform allows artists to release limited-edition digital artwork tracked on the blockchain, making the pieces rare, verified, and collectible. Filter the crypto art world's best selling works by artist name, creation type, and year of birth on OpenSea.",
        },
        openseaRoyalties: [],
        openseaFees: [{ recipient: "0x0000a26b00c1f0df003000390027140000faa719", bps: 250 }],
        contract: "0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0",
        tokenIdRange: null,
        tokenSetId: "contract:0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0",
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
          {
            address: "0x9355372396e3f6daf13359b7b607a3374cc638e0",
            decimals: 4,
            name: "WHALE",
            symbol: "WHALE",
          },
        ],
        creator: "0xb0c6596d32b90d390077f7af7dcC97FfCBD5BdE0",
      })
    );
  });

  it("getTokensMetadata", async () => {
    const tokenMetadata = await MetadataProviderRouter.getTokensMetadata(tokens);

    expect(tokenMetadata).toEqual(
      expect.arrayContaining([
        {
          contract: "0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0",
          tokenId: "12345",
          collection:
            "0xb932a70a57673d89f4acffbe830e8ed7f75fb9e0:superrare-shared-0xb0c6596d32b90d390077f7af7dcC97FfCBD5BdE0",
          slug: "superrare",
          name: "Sphar",
          flagged: false,
          description:
            "To thrive towards perfection leads us to enjoy round shapes. A sphere instantly creates a feeling of fulfillment and pleasure.",
          imageUrl:
            "https://i.seadn.io/gae/WqbpYZmjqbVpdmTLkFnrHWp6eBGEbbwVdaAqsK6snaWyV8_NzDMqAL90zgpzfOgUACzYqV-eamzoKTFGGUSq9lY?w=500&auto=format",
          imageOriginalUrl:
            "https://ipfs.pixura.io/ipfs/QmXmsbkbVkbCccq421J5xmQYNPYpKkMeyFMsfRUFopShLf/Post115Solo.jpg",
          animationOriginalUrl:
            "https://ipfs.pixura.io/ipfs/QmXmsbkbVkbCccq421J5xmQYNPYpKkMeyFMsfRUFopShLf/Post115Solo.jpg",
          metadataOriginalUrl:
            "https://ipfs.pixura.io/ipfs/QmdKvRzTow3wqzTcFCLXdMvGF7ynnBXvZBjPwcz1DQNudC/metadata.json",
          mediaUrl: "https://openseauserdata.com/files/bd577dd9e4c08e98c6f69fddfb414486.jpg",
          attributes: [
            { key: "tag", value: "cloth", kind: "string", rank: 1 },
            { key: "tag", value: "cosmos", kind: "string", rank: 1 },
            { key: "tag", value: "3d", kind: "string", rank: 1 },
            { key: "tag", value: "3dart", kind: "string", rank: 1 },
            { key: "tag", value: "abstractart", kind: "string", rank: 1 },
            { key: "tag", value: "sphere", kind: "string", rank: 1 },
            { key: "tag", value: "abstract", kind: "string", rank: 1 },
            { key: "tag", value: "gold", kind: "string", rank: 1 },
            { key: "tag", value: "museumofcryptoart", kind: "string", rank: 1 },
            { key: "artist", value: "Marterium", kind: "string", rank: 1 },
            { key: "year_created", value: "2020", kind: "string", rank: 1 },
          ],
        },
      ])
    );
  });
});
