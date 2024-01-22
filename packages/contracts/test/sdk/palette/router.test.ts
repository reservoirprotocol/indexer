/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";
import * as Sdk from "@reservoir0x/sdk/src";
import * as indexerHelper from "../../indexer-helper";
import { getChainId, setupNFTs, setupRouterWithModules } from "../../utils";
import { setupPalette } from "./util";
import { BidDetails, ListingDetails } from "@reservoir0x/sdk/src/router/v6/types";

describe("Palette - SingleToken Erc721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;
  let erc1155: Contract;

  let orderbook721: Contract;
  let orderbook1155: Contract;

  beforeEach(async () => {

    [deployer, alice, bob] = await ethers.getSigners();
    ({ erc721, erc1155 } = await setupNFTs(deployer));
    const {
      orderbooks
    } = await setupPalette(deployer, erc721.address, erc1155.address);
    if (orderbooks[0]) {
      orderbook721 = orderbooks[0]
    }
    if (orderbooks[1]) {
      orderbook1155 = orderbooks[1]
    }
    await setupRouterWithModules(chainId, deployer);
  });

  afterEach(async () => {
    // await reset();
  });

  it("Router fill bids", async() => {
    const buyer = alice;
    const seller = bob;
    const tokenId = Math.floor(Math.random() * 100000);
    const price = parseEther("1");

    const bids: BidDetails[] = [];

    await erc721.connect(seller).mint(tokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    let orderInfo: any  = {};

    const buyOrder = new Sdk.Palette.Order(chainId, {
      collection: erc721.address,
      orderbook: orderbook721.address,
      side: "buy",
      kind: "single-token",
      sellerOrBuyer: buyer.address,
      tokenId: tokenId.toString(),
      price: price.toString(),
      amount: "1",
      referrer: constants.AddressZero,
      feePercentage: 0,
      hook: constants.AddressZero
    })

    bids.push({
        // Irrelevant
        orderId: "0",
        kind: "palette",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId.toString(),
        order: buyOrder,
        price: price.toString(),
    });

    await nft.approve(seller, orderbook721.address);
    {
      
      const transaction = await orderbook721
        .connect(buyer)
        .populateTransaction.createSpecificBids(
          [
            tokenId
          ],
          [
            {
              offerer: buyer.address,
              offerAmount: price,
              quantity: 1,
              referrer: constants.AddressZero,
              feePercentage: 0,
              hook: constants.AddressZero
            }
          ],
          '0x',
          {
            gasLimit: 1000000,
            value: price
          }
      );

      const tx = await buyer.sendTransaction(transaction);
      const recepiet = await tx.wait();
      const {
        events,
        onChainData
      } = await indexerHelper.doEventParsing(tx.hash, false);
      expect(onChainData[0].orders.length).eq(1);

      const order = onChainData[0].orders[0];
      const saveResult = await indexerHelper.doOrderSaving({
        contract: erc721.address,
        kind: "erc721",
        currency: Sdk.Common.Addresses.Native[chainId],
        // Refresh balance incase the local indexer doesn't have the state
        makers: [seller.address],
        nfts: [
          {
            collection: erc721.address,
            tokenId: tokenId.toString(),
            owner: seller.address,
          },
        ],
        orders: [
          // Order Info
          {
            // export name from the @/orderbook/index
            kind: "palette",
            data: order.info.orderParams,
          },
        ],
      });

      orderInfo = saveResult[0]
    }

    const tokenId2 = 2;
    const buyOrder2 = new Sdk.Palette.Order(chainId, {
        collection: erc721.address,
        orderbook: orderbook721.address,
        side: "buy",
        kind: "contract-wide",
        sellerOrBuyer: buyer.address,
        price: price.toString(),
        amount: "1",
        referrer: constants.AddressZero,
        feePercentage: 0,
        hook: constants.AddressZero
    })

    await erc721.connect(seller).mint(tokenId2);
    {
        const transaction = await orderbook721
            .connect(buyer)
            .populateTransaction.createCollectionOffer(
            {
                offerer: buyer.address,
                offerAmount: price,
                quantity: 1,
                referrer: constants.AddressZero,
                feePercentage: 0,
                hook: constants.AddressZero
            },
            '0x',
            {
                gasLimit: 1000000,
                value: price
            }
        );

        const tx = await buyer.sendTransaction(transaction);
        const recepiet = await tx.wait();
        const {
            events,
            onChainData
        } = await indexerHelper.doEventParsing(tx.hash, false);

        expect(onChainData[0].orders.length).eq(1);
        const order = onChainData[0].orders[0];
        const saveResult = await indexerHelper.doOrderSaving({
            contract: erc721.address,
            kind: "erc721",
            currency: Sdk.Common.Addresses.Native[chainId],
            // Refresh balance incase the local indexer doesn't have the state
            makers: [seller.address],
            nfts: [
            {
                collection: erc721.address,
                tokenId: tokenId.toString(),
                owner: seller.address,
            },
            ],
            orders: [
            // Order Info
            {
                // export name from the @/orderbook/index
                kind: "palette",
                data: order.info.orderParams,
            },
            ],
        });
        orderInfo = saveResult[0]
    }
    
    bids.push({
        // Irrelevant
        orderId: "1",
        kind: "palette",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: buyOrder2,
        price: price.toString(),
    });

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const tx = await router.fillBidsTx(bids, seller.address, {
        source: "reservoir.market",
    });

    for (const transaction of tx.txs) {
      // Trigger approvals
      for (const approval of transaction.approvals) {
        await seller.sendTransaction(approval.txData);
      }
      await seller.sendTransaction(transaction.txData);
    }
    
    const owner = await nft.getOwner(tokenId);
    expect(owner).eq(buyer.address);
  })

//   it("Router fill listings", async() => {
//     const buyer = alice;
//     const seller = bob;
//     const tokenId = Math.floor(Math.random() * 100000);
//     const price = parseEther("1");
//     await erc1155.connect(seller).mint(tokenId);

//     const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);
//     let orderInfo: any = {};

//     const listings: ListingDetails[] = [];
//     const sellOrder = new Sdk.Palette.Order(chainId, {
//         collection: erc1155.address,
//         orderbook: orderbook1155.address,
//         side: "sell",
//         kind: "single-token",
//         sellerOrBuyer: buyer.address,
//         tokenId: tokenId.toString(),
//         price: price.toString(),
//         amount: "1",
//         referrer: constants.AddressZero,
//         feePercentage: 0,
//         hook: constants.AddressZero
//     });
   
//     listings.push({
//         // Irrelevant
//         orderId: "0",
//         kind: "palette",
//         contractKind: "erc1155",
//         contract: erc721.address,
//         tokenId: tokenId.toString(),
//         order: sellOrder,
//         currency: Sdk.Common.Addresses.Native[chainId],
//         price: price.toString(),
//       });

//     await nft.approve(seller, orderbook1155.address);
//     {

//       console.log("createListings")
//       const transaction = await orderbook1155
//         .connect(seller).populateTransaction
//         .createListings(
//           [
//             tokenId
//           ],
//           [
//             {
//               originalLister: seller.address,
//               price,
//               tokenQuantity: 1,
//               // 1155 listings have no private buyer or deadline
//               privateBuyer: constants.AddressZero,
//               deadline: 1,
//               referrer: constants.AddressZero,
//               feePercentage: 0,
//               hook: constants.AddressZero
//             }
//           ],
//           '0x',
//           {
//             gasLimit: 1000000
//           }
//       );

//       const tx = await seller.sendTransaction(transaction);
//       const recepiet = await tx.wait();
//       const {
//         onChainData
//       } = await indexerHelper.doEventParsing(tx.hash, false);
//       expect(onChainData[0].orders.length).eq(1);
//       const order = onChainData[0].orders[0];
//       const saveResult = await indexerHelper.doOrderSaving({
//         contract: erc1155.address,
//         kind: "erc1155",
//         currency: Sdk.Common.Addresses.Native[chainId],
//         // Refresh balance incase the local indexer doesn't have the state
//         makers: [seller.address],
//         nfts: [
//           {
//             collection: erc1155.address,
//             tokenId: tokenId.toString(),
//             owner: seller.address,
//           },
//         ],
//         orders: [
//           // Order Info
//           {
//             // export name from the @/orderbook/index
//             kind: "palette",
//             data: order.info.orderParams,
//           },
//         ],
//       });

//       orderInfo = saveResult[0]
//     }

//     if (orderInfo.id) {
//       const orderState = await indexerHelper.getOrder(orderInfo.id);
//       // console.log('orderState', orderInfo, orderState)
//       // expect(orderState.fillability_status).eq('filled');
//     }

//     const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
//     const tx = await router.fillListingsTx(
//         listings,
//         buyer.address, 
//         Sdk.Common.Addresses.Native[chainId],
//         {
//             source: "reservoir.market",
//         }
//     );

//     for (const transaction of tx.txs) {
//       // Trigger approvals
//       for (const approval of transaction.approvals) {
//         await buyer.sendTransaction(approval.txData);
//       }
//       await buyer.sendTransaction(transaction.txData);
//     }
    
//     const amount = await nft.getBalance(buyer.address, tokenId.toString());
//     expect(amount).to.eq(1);
//   })
});
