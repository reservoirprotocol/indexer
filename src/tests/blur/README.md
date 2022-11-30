# Blur Integration Tests

``` bash
# start indexer
yarn start
```

```bash
# run tests
yarn test blur-integration.test.ts --runInBand
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
- Create order and store to the database
- Make on-chain transaction(cancel or increase nonce)
- And waiting indexer to index the state change.
- Then check order's status is expected

## Test Cases

### sellERC721

```shell
yarn test blur-integration.test.ts -t sellERC721
```

### buyERC721
```shell
yarn test blur-integration.test.ts -t buyERC721
```

### cancelSell
```shell
yarn test blur-integration.test.ts -t cancelSell
```