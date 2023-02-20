#### Adding support for a new marketplace

Let's go through the process of adding support for a new marketplace, in this case taking LooksRare as an example.

1. Update core SDK

- Create helper classes/methods for parsing, validating and formatting the native order type of the new marketplace. [This](https://github.com/reservoirprotocol/core/tree/main/packages/sdk/src/looks-rare.) is how the LooksRare integration is implemented.
- Update the router (both the [contract](https://github.com/reservoirprotocol/core/tree/main/packages/contracts/contracts/router) and the [filling logic](https://github.com/reservoirprotocol/core/blob/main/packages/sdk/src/router/router.ts)) to handle the new order type.
- Add extensive [unit](https://github.com/reservoirprotocol/core/tree/main/packages/contracts/test/sdk/looks-rare) and [integration](https://github.com/reservoirprotocol/core/tree/main/packages/contracts/test/router) tests for the previous changes.

2. Update backend logic

- Update any order posting APIs (eg. `POST /order`, `POST /orders`) to accept the new order type (example [here](https://github.com/reservoirprotocol/indexer/blob/fae960e4cca55c2b146a5af9b3d6f68df0f33284/src/api/endpoints/orders/post-order/v2.ts#L275-L334))
- Add any needed normalization logic (the Reservoir backend normalizes the orders from all supported marketplaces into a common generic format) (example [here](https://github.com/reservoirprotocol/indexer/blob/v5/src/orderbook/orders/looks-rare/index.ts)).
- Update any execute APIs (eg. `GET /execute/list`, `GET /execute/buy`) to understand the new order type (filling and also building orders of the newly added type) (example [here](https://github.com/reservoirprotocol/indexer/blob/v5/src/orderbook/orders/looks-rare/index.ts)).
