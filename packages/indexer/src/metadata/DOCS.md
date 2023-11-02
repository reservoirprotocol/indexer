<h1> Adding Custom/Extend Metadata</h1>

## Custom

1. Create a new file in `src/metadata/custom/` with the name of your custom metadata address.

2. Add the following template to the file:

```js
export const fetchCollection = async ({
  contract,
  tokenId,
}: {
  contract: string,
  tokenId: string,
}) => {
  return {
    id: contract,
    slug: contract,
    name: contract,
    community: null,
    metadata: null,
    contract,
    tokenIdRange: null,
    tokenSetId: `contract:${contract}`,
    royalties: [],
    openseaRoyalties: [],
    isCopyrightInfringement: false,
  };
};

export const fetchToken = async ({ contract, tokenId }: { contract: string, tokenId: string }) => {
  return {
    contract,
    tokenId: tokenId,
    collection: contract,
    slug: contract,
    name: null,
    flagged: false,
    description: null,
    imageUrl: null,
    imageOriginalUrl: null,
    animationOriginalUrl: null,
    metadataOriginalUrl: null,
    mediaUrl: null,
    attributes: [],
    isCopyrightInfringement: false,
  };
};
```

3. Fill in the template with your custom metadata.

4. Add your custom metadata to the `src/metadata/custom/index.ts` file.

```js
import * as example from "./example";

/////////////////////
// Custom Collections
/////////////////////

// format "chainId,contractAddress" => example
customCollection["1,0x783a32eb03a1175160d210cc99c79e6370a48317"] = example;

////////////////
// Custom Tokens
////////////////

// format "chainId,contractAddress" => example
custom["1,0x783a32eb03a1175160d210cc99c79e6370a48317"] = example;
```

5. Add a test for your custom metadata in `./src/tests/metadata/custom/` with the name of your custom metadata address. Copy the following template into the file, updating values as needed.

```js
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
        isCopyrightInfringement: true,
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
          isCopyrightInfringement: true,
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
```

6. Add env variables to your `.env` file.

```js
OPENSEA_API_KEY=
OPENSEA_SLUG_API_KEY=
OPENSEA_COLLECTION_API_KEY=
OPENSEA_TOKENS_API_KEY=
METADATA_INDEXING_METHOD=opensea
CHAIN_ID=1
BASE_NETWORK_HTTP_URL=
SIMPLEHASH_API_KEY=
METADATA_API_BASE_URL=
```

7. Run your test with `yarn test ./src/tests/metadata/custom/custom-address.test.ts`, replacing `address` with your custom metadata address.

8. Once you confirm your integration is working as intended, open a PR to merge your changes into the `main` branch.

## Extend

1. Create a new file in `src/metadata/extend/` with the name of your extend metadata collection.

2. Add the following template to the file:

```js
export const fetchCollection = async ({
  contract,
  tokenId,
}: {
  contract: string,
  tokenId: string,
}) => {
  return {
    id: contract,
    slug: contract,
    name: contract,
    community: null,
    metadata: null,
    contract,
    tokenIdRange: null,
    tokenSetId: `contract:${contract}`,
    royalties: [],
    openseaRoyalties: [],
    isCopyrightInfringement: false,
  };
};

export const fetchToken = async ({ contract, tokenId }: { contract: string, tokenId: string }) => {
  return {
    contract,
    tokenId: tokenId,
    collection: contract,
    slug: contract,
    name: null,
    flagged: false,
    description: null,
    imageUrl: null,
    imageOriginalUrl: null,
    animationOriginalUrl: null,
    metadataOriginalUrl: null,
    mediaUrl: null,
    attributes: [],
    isCopyrightInfringement: false,
  };
};
```

3. Fill in the template with your extend metadata. See the `src/metadata/extend/` folder for other examples.

4. Add your extend metadata to the `src/metadata/extend/index.ts` file.

```js
import * as example from "./example";

/////////////////////
// Custom Collections
/////////////////////

// format "chainId,contractAddress" => example
extendCollection["1,0x783a32eb03a1175160d210cc99c79e6370a48317"] = example;

////////////////
// Custom Tokens
////////////////

// format "chainId,contractAddress" => example
extend["1,0x783a32eb03a1175160d210cc99c79e6370a48317"] = example;
```

5. Add a test for your extend metadata in `./src/tests/metadata/extend/` with the name of your extend metadata address. Copy the following template into the file, updating values as needed.

```js
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
          imageUrl: "https://ipfs.io/ipfs/QmPbxeGcXhYQQNgsC6a36dDyYUcHgMLnGKnF8pVFmGsvqi",
          bannerImageUrl: "https://ipfs.io/ipfs/QmPbxeGcXhYQQNgsC6a36dDyYUcHgMLnGKnF8pVFmGsvqi",
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
          imageUrl: "https://ipfs.io/ipfs/QmPbxeGcXhYQQNgsC6a36dDyYUcHgMLnGKnF8pVFmGsvqi",
          imageOriginalUrl: "https://ipfs.io/ipfs/QmPbxeGcXhYQQNgsC6a36dDyYUcHgMLnGKnF8pVFmGsvqi",
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
```

6. Add env variables to your `.env` file.

```js
OPENSEA_API_KEY=
OPENSEA_SLUG_API_KEY=
OPENSEA_COLLECTION_API_KEY=
OPENSEA_TOKENS_API_KEY=
METADATA_INDEXING_METHOD=opensea
CHAIN_ID=1
BASE_NETWORK_HTTP_URL=
SIMPLEHASH_API_KEY=
METADATA_API_BASE_URL=
```

7. Run your test with `yarn test ./src/tests/metadata/extend/extend-name.test.ts`, replacing `name` with your extend collection name.

8. Once you confirm your integration is working as intended, open a PR to merge your changes into the `main` branch.
