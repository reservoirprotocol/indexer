### Deployment instructions

Deployment of any contracts required by Reservoir is done in several steps (you can find specific instructions below for each of these steps):

- deploy `ConduitController`, `Seaport` and `Create3Factory` (this step is fully permissionless and anyone can trigger the deployment of these contracts to the same address across any EVM-compatible chain)
- deploy Reservoir-specific contracts (eg. router, modules, and various utility contracts) (the addresses of the deployed contracts will depend on the deployer address)

##### `seaport-and-create3`

```bash
export RPC_URL=
export DEPLOYER_PK=

npx ts-node ./scripts/setup/seaport-and-create3.ts
```

Once the script finalized, make sure to update the corresponding entries in the `sdk` package:

- `Sdk.SeaportBase.Addresses.ConduitController`
- `Sdk.SeaportBase.Addresses.ConduitControllerCodeHash`
- `Sdk.SeaportV15.Addresses.Exchange`
- `Sdk.Common.Addresses.Create3Factory`

##### `reservoir`

Before triggering the script, make sure to update the `hardhat.config.ts` file with the configuration of the new network:

```bash
npx hardhat run --network NETWORK_NAME ./scripts/setup/reservoir.ts
```

As in the previous step, once the script is finalized, make sure to update the corresponding entries in the `sdk` package (check the `deployments.json` file for any newly deployed contracts):

- `Sdk.RouterV6.Addresses.Router`
- `Sdk.RouterV6.Addresses.ApprovalProxy`
- `Sdk.SeaportBase.Addresses.ReservoirConduitKey`
- `Sdk.Common.Addresses.RoyaltyEngine`
- `Sdk.*` (for every deployed router module)
