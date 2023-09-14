# Zora Integration Tests
``` shell
yarn start
```
### .env
```
# For Testing
TEST_ACCOUNT1_KEY=privatekey
TEST_ACCOUNT2_KEY=privatekey
TEST_ACCOUNT1=address
TEST_ACCOUNT2=address
```

- Start indexer
- Run tests
- Make on-chain transaction, and waiting indexer to index the state change.
- Then check order's status is expected

## Test Cases

### Create order
- Make create order tx
- Check database the order is exists

```shell
yarn test zora-integration.test.ts -t create-order
```

### Balance change
- Transfer NFT to another address
- Check order's `fillability_status` has been change to `no-balance`
- Send NFT back
- Check order's `fillability_status` has been change back to `fillable`

```shell
yarn test zora-integration.test.ts -t balance-change
```

### Approval change
- Cancel Approval
- Check order's `approval_status` has been change to `no-approval`
- Approval again
- Check order's `approval_status` has been change to `approved`

```shell
yarn test zora-integration.test.ts -t approval-change
```


### Update order
- Update order
- Check order's `price` has been changed

```shell
yarn test zora-integration.test.ts -t update-order
```

### Fill order
- Fill order 
- Check order's `fillability_status` has been changed to `filled`


```shell
yarn test zora-integration.test.ts -t fill-order
```


### Cancel order
- Cancel order 
- Check order's `fillability_status` has been changed to `cancelled`


```shell
yarn test zora-integration.test.ts -t cancel-order
```

### Update order with invalid currency
``` bash
# create order 
yarn test zora-integration.test.ts -t create-order
# update order
yarn test zora-integration.test.ts -t update-order-invalid-currency
```


