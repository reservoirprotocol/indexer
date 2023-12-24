### Deployment instructions

Deployment of any contracts required by Reservoir is done in several steps (you can find specific instructions below for each of these steps):

- deploy `ConduitController`, `Seaport` and `Create3Factory` (this step is fully permissionless and anyone can trigger the deployment of these contracts to the same address across any EVM-compatible chain)
- deploy Reservoir-specific contracts (eg. router, modules, and various utility contracts) (the addresses of the deployed contracts will depend on the deployer address)

Before deploying, make sure have some funds available on the new network (usually this is achieved via bridging, but the exact method of bridging is different on a per-network basis).

##### `seaport-and-create3`

```bash
export RPC_URL=
export DEPLOYER_PK=

npx ts-node ./scripts/setup/seaport-and-create3.ts
```

Once the script finalized, make sure to update the corresponding entries in the `sdk` package:

- [`Sdk.SeaportBase.Addresses.ConduitController`](../../sdk/src/seaport-base/addresses.ts)
- [`Sdk.SeaportBase.Addresses.ConduitControllerCodeHash`](../../sdk/src/seaport-base/addresses.ts)
- [`Sdk.SeaportV15.Addresses.Exchange`](../../sdk/src/seaport-v1.5/addresses.ts)
- [`Sdk.Common.Addresses.Create3Factory`](../../sdk/src/common/addresses.ts)

##### `reservoir`

Before triggering the script, make sure to update the `hardhat.config.ts` file with the configuration of the new network (the `getNetworkConfig` method and the `networks` field on the `config` object are the places where the new network needs to be available):

```bash
export DEPLOYER_PK=

npx hardhat run --network NETWORK_NAME ./scripts/setup/reservoir.ts
```

As in the previous step, once the script is finalized, make sure to update the corresponding entries in the `sdk` package (check the `deployments.json` file for any newly deployed contracts):

- [`Sdk.RouterV6.Addresses.Router`](../../sdk/src/router/v6/addresses.ts)
- [`Sdk.RouterV6.Addresses.ApprovalProxy`](../../sdk/src/router/v6/addresses.ts)
- [`Sdk.SeaportBase.Addresses.ReservoirConduitKey`](../../sdk/src/seaport-base/addresses.ts)
- [`Sdk.Common.Addresses.RoyaltyEngine`](../../sdk/src/common/addresses.ts)
- `Sdk.*` (for every deployed router module)
