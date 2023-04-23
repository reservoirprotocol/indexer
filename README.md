# indexer-reservoirprotocol - How to add your custom erc20 token

Reservoir supports adding custom ERC-20 tokens for your NFT marketplace. To add support for your custom ERC-20 token, follow these steps:

1. Add your custom token details to the Reservoir indexer configuration file here

Example:

```typescript
[
    "0xceb726e63834......", // MUST BE LOWERCASE
    {
        contract: "0xceb726e638.......",
        name: "Example",
        symbol: "Example",
        decimals: 18,
        metadata: { // OPTIONAL
            image: "{ICON_URL}",
        },
    },
]
```


2. Submit a PR and add the reservoirprotocol/backend team as a reviewer.
3. Once our team has reviewed and merged the PR, the token will be supported.

After completing these steps, your custom ERC-20 token will be supported in the Reservoir NFT marketplace.
