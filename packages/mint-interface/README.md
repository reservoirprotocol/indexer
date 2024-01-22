# Mint interface

Today, Reservoir supports collection mints by trying to decompose and reproduce/simulate the mint transactions. This approach is not fully accurate or comprehensive and has some limitations given that the minting logic of collections can depend on a lot of factors which are not all available / retrievable by parsing mint transactions on the collections. In order to create a simpler and better way for projects to be supported by Reservoir we propose a new interface that projects can use in order to become accurately indexed.

# Specification

We use a new field `mintConfig` on the object pointed to by the commonly-used `contractURI`. This field should contain the configuration information for various common mint-related parameters (eg. start and end time, price, contract and data to pass to the mint method). The support of this method is to be signaled in the contract by emitting the event `MintConfigChanged()` when creating the contract and also any time the configuration changes. The `mintConfig` object is expected to contain data pertaining to each phases of the mint, but can also contain global values. Following are the expected types of the `mintConfig` object and an example of it (see `src/type.d.ts` for the possible types).

Example of `contractURI` with `mintConfig`:

```javascript
{
  "name": "NFT Collection Name",
  "description": "NFT Collection Description",
  "image": "ipfs://Qm...",
  "mintConfig": {
    // The total maximum supply of the collection
    "maxSupply": 10000,
    "phases": [
      {
        // Maximum allowed mints per minting wallet
        "maxMintsPerWallet": 1,
        // Start time
        "startTime": 1702460000,
        // End time
        "endTime": 1702463600,
        // Unit price
        "price": "50000000000000000",
        // Details of the minting method
        "tx": {
          // Contract to call for minting (can be different from the NFT contract itself)
          "to": "0x0000000000000000000000000000000000000002",
          // Mint method 4byte signature
          "method": "0x0000aabb",
          // Parameters of the mint method
          "params": [
            // Force an arbitrary value
            {
              "name": "arbitraryValue",
              "abiType": "uint256",
              "value": 42
            },
            // Allow random string values
            {
              "name": "comment",
              "abiType": "string"
            },
            // Restrict the values
            {
              "name": "theme",
              "abiType": "uint256",
              "values": [
                { "label": "red", "value": 1 },
                { "label": "green", "value": 2 },
                { "label": "blue", "value": 3 },
                { "label": "gold", "value": 4 }
              ]
            }
          ]
        }
      },
      {
        "maxMintsPerWallet": 1,
        "startTime": 1702460000,
        "endTime": 1702463600,
        "price": "75000000000000000",
        "tx": {
          "to": "0x0000000000000000000000000000000000000002",
          "method": "0x0000aabb",
          "params": [
            // Recipient of the mint
            {
              "name": "recipient",
              "abiType": "address",
              "kind": "RECIPIENT"
            },
            // Mint quantity
            {
              "name": "quantity",
              "abiType": "uint256",
              "kind": "QUANTITY"
            },
            // Merkle proof
            {
              "name": "proof",
              "abiType": "bytes",
              "kind": "MAPPING_RECIPIENT",
              "values": {
                "0x0000000000000000000000000000000deadbeef1": "0x14e7c5ea3a66fcc78a4923ef9db55fab89302a507802a3995f4e5dbc69f76920",
                "0x0000000000000000000000000000000deadbeef2": "0xda093f3e739004ec4c1c46ede38a7d1e06d2c6a8c77a9f6783961efca7e82f24",
                "0x0000000000000000000000000000000deadbeef3": "0xb4b2301c3ea107c4363e7b847ae1a959cacb4219680d4214797729d6691e2bf4",
                "0x0000000000000000000000000000000deadbeef4": "0x94deb2a5f7a76bc1553595d5bd8c9fe9173c5c383a1db1a7035945bbefdf297a"
              }
            }
          ]
        }
      }
    ]
  }
}
```
