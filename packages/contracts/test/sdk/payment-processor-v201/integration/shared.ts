/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as PaymentProcessorV201 from "@reservoir0x/sdk/src/payment-processor-v2.0.1";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import chalk from "chalk";
import { ethers } from "hardhat";
import { constants } from "ethers";
import { Builders } from "@reservoir0x/sdk/src/payment-processor-base";
import * as indexerHelper from "../../../indexer-helper";
import { getCurrentTimestamp } from "../../../utils";

const green = chalk.green;
const error = chalk.red;

export const testCase = async ({
    cancelOrder = false,
    isListing = false,
    bulkCancel = false,
    executeByRouterAPI = false,
    failed = false,
    alice,
    bob,
    chainId,
    erc721
  } : {
    cancelOrder?: boolean;
    isListing?: boolean;
    bulkCancel?: boolean;
    executeByRouterAPI?: boolean;
    failed?: boolean;
    alice: SignerWithAddress;
    bob: SignerWithAddress;
    chainId: number;
    erc721: Contract
  }) => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const boughtTokenId = Math.floor(Math.random() * 100000);
    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);
    await weth.deposit(seller, price);

    // Approve the exchange contract for the buyer
    await weth.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);
    await weth.approve(buyer, PaymentProcessorV201.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);
    await nft.approve(buyer, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);
    console.log(green("\n\n\t Build Order"));

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc721.address,
      tokenId: boughtTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    let order = builder.build(orderParameters, PaymentProcessorV201.Order);
    // let matchOrder = order.buildMatching({
    //   taker: seller.address,
    //   takerMasterNonce: sellerMasterNonce,
    // });

    await order.sign(buyer);

    if (isListing) {
      const listingParams = {
        protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
        marketplace: constants.AddressZero,
        marketplaceFeeNumerator: "0",
        maxRoyaltyFeeNumerator: "0",
        maker: seller.address,
        tokenAddress: erc721.address,
        tokenId: boughtTokenId,
        amount: "1",
        itemPrice: price,
        expiration: (blockTime + 60 * 60).toString(),
        paymentMethod: constants.AddressZero,
        masterNonce: sellerMasterNonce,
      };
      order = builder.build(listingParams, PaymentProcessorV201.Order);
      // matchOrder = order.buildMatching({
      //   taker: buyer.address,
      //   takerMasterNonce: buyerMasterNonce,
      // });

      await order.sign(seller);
      // await matchOrder.sign(buyer);
    }
    console.log(green("\t Perform Order Saving:"));

    // Call the Indexer to save the order
    const saveResult = await indexerHelper.doOrderSaving({
      contract: erc721.address,
      kind: "erc721",
      currency: order.params.paymentMethod,
      // Refresh balance incase the local indexer doesn't have the state
      makers: [order.params.sellerOrBuyer],
      nfts: [
        {
          collection: erc721.address,
          tokenId: boughtTokenId.toString(),
          owner: seller.address,
        },
      ],
      orders: [
        // Order Info
        {
          // export name from the @/orderbook/index
          kind: "paymentProcessorV201",
          data: order.params,
        },
      ],
    });

    const orderInfo = saveResult[0];

    console.log(`\t\t - Status: ${orderInfo.status}`);
    console.log(`\t\t - ID: ${orderInfo.id}`);

    // Handle Cancel Test
    if (cancelOrder) {
      console.log("\t Cancel Order");
      const tx = await exchange.cancelOrder(!isListing ? buyer : seller, order);

      console.log(green("\t Event Parsing:"));
      const parseResult = await indexerHelper.doEventParsing(tx.hash, true);
      const onChainData = parseResult.onChainData[0];
      if (!onChainData) {
        console.log("\t\t  Parse Event Failed", tx.hash);
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 4 * 1000);
      });

      const orderState = await indexerHelper.getOrder(orderInfo.id);
      const { nonceCancelEvents } = onChainData;
      if (nonceCancelEvents.length) {
        console.log(green(`\t\t found nonceCancelEvents(${nonceCancelEvents.length})`));
      } else {
        console.log(error("\t\t nonceCancelEvents not found"));
      }

      console.log(green("\t Order Status: "));
      console.log(
        "\t\t - Final Order Status =",
        JSON.stringify({
          fillability_status: orderState.fillability_status,
          approval_status: orderState.approval_status,
        })
      );
      expect(nonceCancelEvents.length).to.eq(1);
      return;
    }

    // Handle Cancel Test
    if (bulkCancel) {
      console.log(green("\t Bulk Cancel Order"));
      const tx = await exchange.revokeMasterNonce(!isListing ? buyer : seller);

      console.log(green("\t Event Parsing:"));
      const parseResult = await indexerHelper.doEventParsing(tx.hash, true);

      if (parseResult.error) {
        console.log("parseResult", parseResult);
        console.log(error(JSON.stringify(parseResult.error, null, 2)));
        return;
      }

      const onChainData = parseResult.onChainData[0];
      if (!onChainData) {
        console.log("\t\t  Parse Event Failed");
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 2 * 1000);
      });

      const orderState = await indexerHelper.getOrder(orderInfo.id);
      const { bulkCancelEvents } = onChainData;
      if (bulkCancelEvents.length) {
        console.log(green(`\t\t found bulkCancelEvents ${bulkCancelEvents.length}`));
      } else {
        console.log(error("\t\t bulkCancelEvents not found"));
      }

      console.log(green("\t Order Status: "));
      console.log(
        "\t\t - Final Order Status =",
        JSON.stringify({
          fillability_status: orderState.fillability_status,
          approval_status: orderState.approval_status,
        })
      );
      expect(bulkCancelEvents.length).to.eq(1);
      // expect(orderState.fillability_status).to.eq("cancelled");
      return;
    }

    // console.log({
    //   isListing,
    //   seller: seller.address,
    //   buyer: buyer.address,
    // });

    await order.checkFillability(ethers.provider);

    // Lock transfer
    if (failed) {
      console.log('lock token')
      await erc721.lock();
      console.log('locked', await erc721.locked())
    }

    // Fill Order

    let fillTxHash: string | null = null;

    if (!executeByRouterAPI) {
      const taker = !isListing ? seller : buyer;
      const txData = await exchange.fillOrdersTx(await taker.getAddress(), [
        order
      ],  [
        {
          taker: isListing ? buyer.address : seller.address,
        }
      ]);
      delete txData.gas;
      const tx = await taker.sendTransaction(txData);
      // await tx.wait();
      fillTxHash = tx.hash;
    } else {
      if (!isListing) {
        try {
          const executeResponse = await indexerHelper.executeSellV7({
            items: [
              {
                token: `${erc721.address}:${boughtTokenId}`,
                quantity: 1,
                orderId: orderInfo.id,
              },
            ],
            taker: isListing ? buyer.address : seller.address,
          });
          const allSteps = executeResponse.steps;
          const lastSetp = allSteps[allSteps.length - 1];
          const transcation = lastSetp.items[0];
          const tx = await seller.sendTransaction(transcation.data);
          await tx.wait();
          fillTxHash = tx.hash;
        } catch (error) {
          console.log("executeSellV7 failed", error);
        }
      } else {
        try {
          const payload = {
            items: [
              {
                orderId: orderInfo.id,
              },
            ],
            taker: isListing ? buyer.address : seller.address,
          };
          const executeResponse = await indexerHelper.executeBuyV7(payload);
          const allSteps = executeResponse.steps;
          const lastSetp = allSteps[allSteps.length - 1];
          const transcation = lastSetp.items[0];
          const tx = await buyer.sendTransaction({
            ...transcation.data,
          });
          await tx.wait();
          fillTxHash = tx.hash;
        } catch (error) {
          console.log("executeBuyV7 failed", (error as any).toString());
        }
      }
    }

    if (!fillTxHash) {
      return;
    }

    // Call Indexer to index the transcation
    const skipProcessing = false;

    console.log(green("\t Event Parsing:"));
    console.log(`\t\t - fillTx: ${fillTxHash}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await indexerHelper.doEventParsing(fillTxHash, skipProcessing);
    const parseResult = await indexerHelper.doEventParsing(fillTxHash, skipProcessing);

    const onChainData = parseResult.onChainData[0];
    if (!onChainData) {
      console.log("\t\t  Parse Event Failed");
    }

    const { fillEvents } = onChainData;
    const matchFillEvent = fillEvents.find((event: any) => event.orderId === orderInfo.id);
    if (matchFillEvent) {
      const orderData = {
        maker: order.params.sellerOrBuyer,
        taker: (isListing ? buyer : seller).address.toLowerCase(),
      };
      // console.log('orderData', orderData)
      // console.log('matchFillEvent', {
      //   taker: matchFillEvent.taker,
      //   maker: matchFillEvent.maker,
      //   side: matchFillEvent.orderSide
      // })
      expect(orderData.maker).to.eq(matchFillEvent.maker);
      expect(orderData.taker).to.eq(matchFillEvent.taker);
      console.log("\t\t - Found Fill Event");
    } else {
      console.log("\t\t - Fill Event Not Found");
    }

    console.log(green("\t Order Status: "));
    const finalOrderState = await indexerHelper.getOrder(orderInfo.id);
    expect(finalOrderState.fillability_status).to.eq(failed ? "fillable" : "filled");
    console.log(
      "\t\t - Final Order Status =",
      JSON.stringify({
        fillability_status: finalOrderState.fillability_status,
        approval_status: finalOrderState.approval_status,
      })
    );
  };


// describe("PaymentProcessorV201 - Indexer Integration Test", () => {
//   const chainId = getChainId();

//   let deployer: SignerWithAddress;
//   let alice: SignerWithAddress;
//   let bob: SignerWithAddress;

//   let erc721: Contract;

//   beforeEach(async () => {
//     // Reset Indexer
//     await indexerHelper.reset();

//     [deployer, alice, bob] = await ethers.getSigners();
//     ({ erc721 } = await setupNFTs(deployer));
//   });

//   afterEach(async () => {
//     // await reset();
//   });


//   it("Fill listing with cancel", async () => {
//     await testCase({
//       cancelOrder: true,
//     });
//     console.log("\n");
//   });

//   // it("Fill Offer via Router API", async () =>
//   //   testCase({
//   //     executeByRouterAPI: true,
//   //   }));

//   // it("Fill Listing via Router API", async () =>
//   //   testCase({
//   //     isListing: true,
//   //     executeByRouterAPI: true,
//   //   }));

//   // it("Fill offer", async () => testCase({}));

//   // it("Fill listing", async () =>
//   //   testCase({
//   //     isListing: true,
//   //   }));


//   // it("Fill listing and failed", async () =>
//   //   testCase({
//   //     isListing: true,
//   //     failed: true
//   //   }));

//   // it("Fill listing with bulk Cancel", async () =>
//   //   testCase({
//   //     bulkCancel: true,
//   //   }));
// });
