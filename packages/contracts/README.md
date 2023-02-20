### Reservoir Router

Cross-exchange NFT sweeping.

#### Setup and test

For running the tests, make sure to have an `.env` file containing the following envs:

```bash
ALCHEMY_KEY=

# Block to run mainnet forking tests on (should be a recent block for up-to-date results, eg. 15321679)
BLOCK_NUMBER=

# Optional for running the X2Y2 module tests
X2Y2_API_KEY=
```

To install any dependencies and run all tests (tests can also be run individually):

```bash
# Install dependencies
yarn install

# Run tests
yarn test ./test/router/v6/**/*.test.ts

# Run an individual test
yarn test ./test/router/v6/seaport/listings.test.ts
```

#### Modules

The [Reservoir router](../contracts/contracts/router/ReservoirV6_0_0.sol) is a singular immutable smart contract which acts as an execution layer on top of multiple [pluggable module contracts](../contracts/contracts/router/modules/). A module contract acts as a wrapper for a specific piece of funtionality (eg. filling Seaport/LooksRare/X2Y2 orders, swapping tokens on Uniswap V3). Modules can be registered by the owner of the router contract and once added they can never be revoked (thus ensuring there is no way to break backwards-compatibility).

#### No state

One of the main goals of the router is to be completely stateless, holding no funds and requiring no approvals on the router/module contracts (in order to reduce the risk surface and allow easy upgradeability). This means that the risk is limited to a per-transaction basis (eg. making sure no funds get lost as part of filling through the router) rather than globally (eg. funds that can be stolen from the router). Due to this, filling orders that require anything other than ETH can be tricky (since ERC20/ERC721/ERC1155 all require approvals to be able to transfer on someone's behalf). We overcome this via two methods:

- When executing anything that requires the approval of a single ERC721/ERC1155 token id, we use the `onERC721Received` and `onERC1155Received` hooks to transfer the NFT to the corresponding module contract and then make any other needed calls.

- In all other cases, we use Seaport approval orders. A Seaport approval order is a short-lived order (in the range of minutes) which can send any tokens to a particular recipient free of charge. This still requires an approval, but on the Seaport contract (or a specific Seaport conduit) rather than on the router. One issue though is that without any further mechanism for protection, these orders can be front-run (eg. someone could listen for these orders in the mempool and then create an execution which first fills the Seaport approval order and then transfers any received funds to them). To overcome this limitation, all such orders should be associated to the [`SeaportApprovalOrderZone`](../contracts/contracts/router/misc/SeaportApprovalOrderZone.sol) zone, which verifies that no one other than the original transaction sender (eg. `tx.origin`) can trigger the filling of the approval order.
