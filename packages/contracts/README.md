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
yarn test ./test/router/**/*.test.ts

# Run an individual test
yarn test ./test/router/seaport-v1.5/listings.test.ts
```

#### Modules

The [Reservoir router](../contracts/contracts/router/ReservoirV6_0_1.sol) is a singular immutable smart contract which acts as an execution layer on top of multiple [pluggable module contracts](../contracts/contracts/router/modules/). A module contract acts as a wrapper for a specific piece of funtionality (eg. filling Seaport/LooksRare/X2Y2 orders, swapping tokens on Uniswap V3). Modules can be registered by the owner of the router contract and once added they can never be revoked (thus ensuring there is no way to break backwards-compatibility).

#### No state

One of the main goals of the router is to be completely stateless, holding no funds and requiring no approvals on the router/module contracts (in order to reduce the risk surface and allow easy upgradeability). This means that the risk is limited to a per-transaction basis (eg. making sure no funds get lost as part of filling through the router) rather than globally (eg. funds that can be stolen from the router). Due to this, filling orders that require anything other than ETH can be tricky (since ERC20/ERC721/ERC1155 all require approvals to be able to transfer on someone's behalf). We overcome this via two methods:

- When executing anything that requires the approval of a single ERC721/ERC1155 token id, we use the `onERC721Received` and `onERC1155Received` hooks to transfer the NFT to the corresponding module contract and then make any other needed calls.
