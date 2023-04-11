# Integration Test

### Run Local Fork
``` bash
cd packages/contracts
npx hardhat node --fork http://localhost:8961
```

### Indexer

Update .env
```
ENABLE_DEBUG=1
BASE_NETWORK_HTTP_URL=http://127.0.0.1:8545
```

Start Server
``` bash
cd packages/indexer
yarn dev
```

### Run Test
```bash
cd packages/contracts
yarn test test/sdk/looks-rare-v2/integration.test.ts --network localhost
```

### Demo
``` bash

$ hardhat test test/sdk/looks-rare-v2/integration.test.ts --network localhost


  LooksRareV2 - Indexer Integration Test


         Build Order
         Perform Order Saving:
                 - Status: success
                 - ID: 0xd1b0325c05673480c690add1ff15ede64bde2b902e273fd2854cd6ec7b9c3f0f
         Event Parsing:
                 - Found Fill Event
         Order Status: 
                 - Final Order Status = {"fillability_status":"filled","approval_status":"approved"}
    ✔ Fill Offer (350ms)


         Build Order
         Perform Order Saving:
                 - Status: success
                 - ID: 0x02f6adc5d42b18614e5c2e568e578ae5b7ebe5c150c8ebc20f253509335ee8e9
         Event Parsing:
                 - Found Fill Event
         Order Status: 
                 - Final Order Status = {"fillability_status":"filled","approval_status":"approved"}
    ✔ Fill Listing (320ms)


         Build Order
         Perform Order Saving:
                 - Status: success
                 - ID: 0x18e42432add07a3e6378c89f81be12c240809025df8f84844aaa121df3ba0cdf
         Bulk Cancel Order
         Event Parsing:
                 found bulkCancelEvents 2
         Order Status: 
                 - Final Order Status = {"fillability_status":"cancelled","approval_status":"approved"}
    ✔ Fill Listing With Cancel (2203ms)


         Build Order
         Perform Order Saving:
                 - Status: success
                 - ID: 0xef64b82409df43879b1cbe31413c3744c3ac21bbf14ea9938a5278b18c02f377
         Bulk Cancel Order
         Event Parsing:
                 found bulkCancelEvents 2
         Order Status: 
                 - Final Order Status = {"fillability_status":"cancelled","approval_status":"approved"}


         Build Order
         Perform Order Saving:
                 - Status: success
                 - ID: 0x5e508cb296f2b00147314e09e33106a323f8bf76f5a5371e647db6cc1ce7539a
         Bulk Cancel Order
         Event Parsing:
                 found bulkCancelEvents 2
         Order Status: 
                 - Final Order Status = {"fillability_status":"cancelled","approval_status":"approved"}


    ✔ Fill Listing With Bulk Cancel - Multiple (4495ms)


         Build Order
         Perform Order Saving:
                 - Status: success
                 - ID: 0xe21f74e361d1ec6e2471b1b147bded892bb6a12556862ed44ae265428adc5d0d
         Event Parsing:
                 - Found Fill Event
         Order Status: 
                 - Final Order Status = {"fillability_status":"filled","approval_status":"approved"}
    ✔ Fill Offer via Router API (5508ms)


         Build Order
         Perform Order Saving:
                 - Status: success
                 - ID: 0x6bcea694bcf0c15c45c8f5575b8547a9f6db5761d973c4823eb009c2c0d06a00
         Event Parsing:
                 - Found Fill Event
         Order Status: 
                 - Final Order Status = {"fillability_status":"filled","approval_status":"approved"}
    ✔ Fill Listing via Router API (306ms)


  6 passing (22s)

✨  Done in 24.91s.
```