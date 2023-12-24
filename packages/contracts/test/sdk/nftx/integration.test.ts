/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import chalk from "chalk";
import { ethers } from "hardhat";

import * as indexerHelper from "../../indexer-helper";
import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../utils";

const green = chalk.green;
const error = chalk.red;

describe("NFTx - Indexer Integration Test", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    // Reset Indexer
    await indexerHelper.reset();
    [deployer, alice, bob] = await ethers.getSigners();
    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(async () => {
    // await reset();
  });

  const testCase = async ({
    cancelOrder = false,
    isListing = false,
    bulkCancel = false,
    executeByRouterAPI = false,
    subsetCancel = false,
  }) => {
    const currency = Common.Addresses.WNative[chainId];
    const result = await indexerHelper.doEventParsing(
      "0x123505c7b5e92e9816535c0fa474992108a5dbfdd5eb5d94f524e56fd35aede4",
      false
    );
    if (result.error) {
      console.log(result.error);
    } else {
      for (let index = 0; index < result.onChainData[0].orders.length; index++) {
        const order = result.onChainData[0].orders[index];
        console.log("order", order);

        // Call the Indexer to save the order
        const saveResult = await indexerHelper.doOrderSaving({
          contract: "0x5af0d9827e0c53e4799bb226655a1de152a425a5",
          kind: "erc721",
          currency: currency,
          makers: [],
          nfts: [],
          orders: [
            // Order Info
            {
              // export name from the @/orderbook/index
              kind: "nftx",
              data: order.info.orderParams,
            },
          ],
        });

        console.log("saveResult", saveResult);
      }
    }

    // // Mint weth to buyer
    // await weth.deposit(buyer, price);
    // await weth.deposit(seller, price);

    // // Approve the exchange contract for the buyer
    // await weth.approve(seller, LooksRareV2.Addresses.Exchange[chainId]);
    // await weth.approve(buyer, LooksRareV2.Addresses.Exchange[chainId]);

    // // Mint erc721 to seller
    // await erc721.connect(seller).mint(boughtTokenId);

    // const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // // Approve the transfer manager
    // await nft.approve(seller, LooksRareV2.Addresses.TransferManager[chainId]);

    // await nft.approve(buyer, LooksRareV2.Addresses.TransferManager[chainId]);

    // const exchange = new LooksRareV2.Exchange(chainId);
    // await exchange.grantApprovals(seller, [LooksRareV2.Addresses.Exchange[chainId]]);
    // await exchange.grantApprovals(buyer, [LooksRareV2.Addresses.Exchange[chainId]]);

    // console.log(green("\n\n\t Build Order"));

    // const builder = new LooksRareV2.Builders.SingleToken(chainId);

    // // Build order
    // const orderParameters = {
    //   quoteType: LooksRareV2.Types.QuoteType.Bid,
    //   strategyId: 0,
    //   collectionType: LooksRareV2.Types.CollectionType.ERC721,
    //   signer: buyer.address,
    //   collection: erc721.address,
    //   itemId: boughtTokenId,
    //   amount: 1,
    //   currency: Common.Addresses.WNative[chainId],
    //   price,
    //   globalNonce: await exchange.getGlobalNonce(ethers.provider, buyer.address, "buy"),
    //   startTime: await getCurrentTimestamp(ethers.provider),
    //   endTime: (await getCurrentTimestamp(ethers.provider)) + 86400 * 31,
    // };

    // let order = builder.build(orderParameters);
    // let matchOrder = order.buildMatching(seller.address);
    // await order.sign(buyer);

    // const onChainFill = await indexerHelper.doEventParsing("0x123505c7b5e92e9816535c0fa474992108a5dbfdd5eb5d94f524e56fd35aede4")

    // if (isListing) {
    //   const listingParams = {
    //     quoteType: LooksRareV2.Types.QuoteType.Ask,
    //     strategyId: 0,
    //     collectionType: LooksRareV2.Types.CollectionType.ERC721,
    //     signer: seller.address,
    //     collection: erc721.address,
    //     itemId: boughtTokenId,
    //     amount: 1,
    //     currency: Common.Addresses.WNative[chainId],
    //     price,
    //     startTime: await getCurrentTimestamp(ethers.provider),
    //     endTime: (await getCurrentTimestamp(ethers.provider)) + 86400 * 31,
    //     globalNonce: await exchange.getGlobalNonce(ethers.provider, buyer.address, "sell"),
    //   };
    //   order = builder.build(listingParams);
    //   matchOrder = order.buildMatching(buyer.address);
    //   await order.sign(seller);
    // }

    // console.log(green("\t Perform Order Saving:"));

    // const orderInfo = saveResult[0];

    // console.log(`\t\t - Status: ${orderInfo.status}`);
    // console.log(`\t\t - ID: ${orderInfo.id}`);

    // // Handle Cancel Test
    // if (cancelOrder) {
    //   console.log("\t Cancel Order");
    //   const tx = await exchange.cancelOrder(!isListing ? buyer : seller, order);

    //   console.log(green("\t Event Parsing:"));
    //   const parseResult = await indexerHelper.doEventParsing(tx.hash, false);
    //   const onChainData = parseResult.onChainData[0];
    //   if (!onChainData) {
    //     console.log("\t\t  Parse Event Failed");
    //   }

    //   await new Promise((resolve) => {
    //     setTimeout(resolve, 4 * 1000);
    //   });

    //   const orderState = await indexerHelper.getOrder(orderInfo.id);
    //   const { nonceCancelEvents } = onChainData;
    //   if (nonceCancelEvents.length) {
    //     console.log(green(`\t\t found nonceCancelEvents(${nonceCancelEvents.length})`));
    //   } else {
    //     console.log(error("\t\t nonceCancelEvents not found"));
    //   }

    //   console.log(green("\t Order Status: "));
    //   console.log(
    //     "\t\t - Final Order Status =",
    //     JSON.stringify({
    //       fillability_status: orderState.fillability_status,
    //       approval_status: orderState.approval_status,
    //     })
    //   );
    //   expect(orderState.fillability_status).to.eq("cancelled");
    //   return;
    // }

    // // Handle Cancel Test
    // if (bulkCancel) {
    //   console.log(green("\t Bulk Cancel Order"));
    //   const orderSide = isListing ? "sell" : "buy";
    //   const tx = await exchange.cancelAllOrders(!isListing ? buyer : seller, orderSide);

    //   console.log(green("\t Event Parsing:"));
    //   const parseResult = await indexerHelper.doEventParsing(tx.hash, false);

    //   if (parseResult.error) {
    //     console.log(error(JSON.stringify(parseResult.error, null, 2)));
    //     return;
    //   }

    //   const onChainData = parseResult.onChainData[0];
    //   if (!onChainData) {
    //     console.log("\t\t  Parse Event Failed");
    //   }

    //   await new Promise((resolve) => {
    //     setTimeout(resolve, 2 * 1000);
    //   });

    //   const orderState = await indexerHelper.getOrder(orderInfo.id);
    //   const { bulkCancelEvents } = onChainData;
    //   if (bulkCancelEvents.length) {
    //     console.log(green(`\t\t found bulkCancelEvents ${bulkCancelEvents.length}`));
    //   } else {
    //     console.log(error("\t\t bulkCancelEvents not found"));
    //   }

    //   console.log(green("\t Order Status: "));
    //   console.log(
    //     "\t\t - Final Order Status =",
    //     JSON.stringify({
    //       fillability_status: orderState.fillability_status,
    //       approval_status: orderState.approval_status,
    //     })
    //   );
    //   expect(orderState.fillability_status).to.eq("cancelled");
    //   return;
    // }

    // // Handle subsetCancel
    // if (subsetCancel) {
    //   console.log(green("\t Bulk Cancel Order"));
    //   const tx = await exchange.cancelOrdersWithSubset(!isListing ? buyer : seller, order);

    //   console.log(green("\t Event Parsing:"));
    //   const parseResult = await indexerHelper.doEventParsing(tx.hash, false);

    //   if (parseResult.error) {
    //     console.log(error(JSON.stringify(parseResult.error, null, 2)));
    //     return;
    //   }

    //   const onChainData = parseResult.onChainData[0];
    //   if (!onChainData) {
    //     console.log("\t\t  Parse Event Failed");
    //   }

    //   await new Promise((resolve) => {
    //     setTimeout(resolve, 2 * 1000);
    //   });

    //   const orderState = await indexerHelper.getOrder(orderInfo.id);
    //   // const { subsetNonceCancelEvents } = onChainData;
    //   // if (subsetNonceCancelEvents.length) {
    //   //     console.log(green(`\t\t found subsetNonceCancelEvents ${subsetNonceCancelEvents.length}`))
    //   // } else {
    //   //     console.log(error("\t\t subsetNonceCancelEvents not found"))
    //   // }

    //   console.log(green("\t Order Status: "));
    //   console.log(
    //     "\t\t - Final Order Status =",
    //     JSON.stringify({
    //       fillability_status: orderState.fillability_status,
    //       maker: orderState.maker,
    //       approval_status: orderState.approval_status,
    //     })
    //   );
    //   expect(orderState.fillability_status).to.eq("cancelled");
    //   return;
    // }

    // await order.checkFillability(ethers.provider);

    // // Fill Order

    // let fillTxHash: string | null = null;

    // if (!executeByRouterAPI) {
    //   const tx = await exchange.fillOrder(!isListing ? seller : buyer, order, matchOrder);
    //   await tx.wait();
    //   fillTxHash = tx.hash;
    // } else {
    //   if (!isListing) {
    //     try {
    //       const executeResponse = await indexerHelper.executeSellV7({
    //         items: [
    //           {
    //             token: `${erc721.address}:${boughtTokenId}`,
    //             quantity: 1,
    //             orderId: orderInfo.id,
    //           },
    //         ],
    //         taker: matchOrder.recipient,
    //       });

    //       const allSteps = executeResponse.steps;
    //       const lastSetp = allSteps[allSteps.length - 1];
    //       const tx = await seller.sendTransaction(lastSetp.items[0].data);
    //       await tx.wait();
    //       fillTxHash = tx.hash;
    //     } catch (error) {
    //       console.log("executeSellV7 failed", error);
    //     }
    //   } else {
    //     try {
    //       const payload = {
    //         items: [
    //           {
    //             orderId: orderInfo.id,
    //           },
    //         ],
    //         taker: matchOrder.recipient,
    //       };
    //       const executeResponse = await indexerHelper.executeBuyV7(payload);
    //       const allSteps = executeResponse.steps;
    //       const lastSetp = allSteps[allSteps.length - 1];

    //       const transcation = lastSetp.items[0];
    //       const tx = await buyer.sendTransaction({
    //         ...transcation.data,
    //         gasLimit: 300000,
    //       });
    //       await tx.wait();
    //       fillTxHash = tx.hash;
    //     } catch (error) {
    //       console.log("executeBuyV7 failed", (error as any).toString());
    //     }
    //   }
    // }

    // if (!fillTxHash) {
    //   return;
    // }

    // // Call Indexer to index the transcation
    // const skipProcessing = false;

    // console.log(green("\t Event Parsing:"));
    // const parseResult = await indexerHelper.doEventParsing(fillTxHash, skipProcessing);
    // const onChainData = parseResult.onChainData[0];
    // if (!onChainData) {
    //   console.log("\t\t  Parse Event Failed");
    // }

    // const { fillEvents } = onChainData;

    // const matchFillEvent = fillEvents.find((event: any) => event.orderId === orderInfo.id);
    // if (matchFillEvent) {
    //   const orderData = {
    //     maker: order.params.signer,
    //     taker: (isListing ? buyer : seller).address.toLowerCase(),
    //   };

    //   expect(orderData.maker).to.eq(matchFillEvent.maker);
    //   expect(orderData.taker).to.eq(matchFillEvent.taker);
    //   // console.log({
    //   //     side: matchFillEvent.orderSide,
    //   //     maker: matchFillEvent.maker,
    //   //     taker: matchFillEvent.taker,
    //   //     isListing,
    //   //     order: {
    //   //         maker: order.params.signer,
    //   //         taker: (isListing ? buyer : seller).address
    //   //     }
    //   // })
    //   console.log("\t\t - Found Fill Event");
    // } else {
    //   console.log("\t\t - Fill Event Not Found");
    // }

    // console.log(green("\t Order Status: "));
    // const finalOrderState = await indexerHelper.getOrder(orderInfo.id);
    // expect(finalOrderState.fillability_status).to.eq("filled");
    // console.log(
    //   "\t\t - Final Order Status =",
    //   JSON.stringify({
    //     fillability_status: finalOrderState.fillability_status,
    //     approval_status: finalOrderState.approval_status,
    //   })
    // );
  };

  // it("Fill Listing With Bulk Cancel - Multiple", async () => {
  //   await testCase({
  //     cancelOrder: true,
  //   });
  //   await testCase({
  //     cancelOrder: true,
  //   });
  //   console.log("\n");
  // });

  // it("Fill Offer via Router API", async () =>
  //   testCase({
  //     executeByRouterAPI: true,
  //   }));

  // it("Fill Listing via Router API", async () =>
  //   testCase({
  //     isListing: true,
  //     executeByRouterAPI: true,
  //   }));

  // it("Fill Offer", async () => testCase({}));

  // it("Fill Listing", async () =>
  //   testCase({
  //     isListing: true,
  //   }));

  // it("Fill Listing With Cancel", async () =>
  //   testCase({
  //     bulkCancel: true,
  //   }));

  it("EventHandle", async () =>
    testCase({
      subsetCancel: true,
    }));
});
