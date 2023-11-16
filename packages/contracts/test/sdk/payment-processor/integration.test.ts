/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as PaymentProcessor from "@reservoir0x/sdk/src/payment-processor";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import chalk from "chalk";
import { ethers } from "hardhat";
import { constants } from "ethers";

import * as indexerHelper from "../../indexer-helper";
import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../utils";

const green = chalk.green;
const error = chalk.red;

describe("PaymentProcessor - Indexer Integration Test", () => {
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
    await weth.approve(seller, PaymentProcessor.Addresses.Exchange[chainId]);
    await weth.approve(buyer, PaymentProcessor.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, PaymentProcessor.Addresses.Exchange[chainId]);
    await nft.approve(buyer, PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessor.Exchange(chainId);
    console.log(green("\n\n\t Build Order"));

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessor.Types.TokenProtocols.ERC721,
      sellerAcceptedOffer: true,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      trader: buyer.address,
      tokenAddress: erc721.address,
      tokenId: boughtTokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 86400 * 30).toString(),
      coin: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    let order = builder.build(orderParameters);
    let matchOrder = order.buildMatching({
      taker: seller.address,
      takerMasterNonce: sellerMasterNonce,
    });

    await order.sign(buyer);
    await matchOrder.sign(seller);

    if (isListing) {
      const listingParams = {
        protocol: 0,
        sellerAcceptedOffer: false,
        marketplace: constants.AddressZero,
        marketplaceFeeNumerator: "0",
        maxRoyaltyFeeNumerator: "0",
        privateTaker: constants.AddressZero,
        trader: seller.address,
        tokenAddress: erc721.address,
        tokenId: boughtTokenId,
        amount: "1",
        price: price,
        expiration: (blockTime + 86400 * 30).toString(),
        coin: Common.Addresses.Native[chainId],
        masterNonce: sellerMasterNonce,
      };
      order = builder.build(listingParams);
      matchOrder = order.buildMatching({
        taker: buyer.address,
        takerMasterNonce: buyerMasterNonce,
      });
      await order.sign(seller);
      await matchOrder.sign(buyer);
    }

    console.log(green("\t Perform Order Saving:"));

    // Call the Indexer to save the order
    const saveResult = await indexerHelper.doOrderSaving({
      contract: erc721.address,
      kind: "erc721",
      currency: order.params.coin,
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
          kind: "paymentProcessor",
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

    console.log({
      isListing,
      seller: seller.address,
      buyer: buyer.address,
    });

    await order.checkFillability(ethers.provider);

    // Fill Order

    let fillTxHash: string | null = null;

    if (!executeByRouterAPI) {
      const tx = await exchange.fillOrder(!isListing ? seller : buyer, order, matchOrder);
      await tx.wait();
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
            taker: matchOrder.params.sellerOrBuyer,
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
            taker: matchOrder.params.sellerOrBuyer,
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
    const parseResult = await indexerHelper.doEventParsing(fillTxHash, skipProcessing);

    const onChainData = parseResult.onChainData[0];
    if (!onChainData) {
      console.log("\t\t  Parse Event Failed");
    }

    const { fillEvents } = onChainData;
    const matchFillEvent = fillEvents.find((event: any) => event.orderId === orderInfo.id);
    if (matchFillEvent) {
      const orderData = {
        id: orderInfo.id,
        maker: order.params.sellerOrBuyer,
        taker: (isListing ? buyer : seller).address.toLowerCase(),
      };

      expect(orderData.maker).to.eq(matchFillEvent.maker);
      expect(orderData.taker).to.eq(matchFillEvent.taker);
      expect(orderData.id).to.eq(matchFillEvent.orderId);
      console.log("\t\t - Found Fill Event");
    } else {
      console.log("\t\t - Fill Event Not Found");
    }

    console.log(green("\t Order Status: "));
    const finalOrderState = await indexerHelper.getOrder(orderInfo.id);
    expect(finalOrderState.fillability_status).to.eq("filled");
    console.log(
      "\t\t - Final Order Status =",
      JSON.stringify({
        fillability_status: finalOrderState.fillability_status,
        approval_status: finalOrderState.approval_status,
      })
    );
  };

  // it("Fill listing with cancel", async () => {
  //   await testCase({
  //     cancelOrder: true,
  //   });
  //   console.log("\n");
  // });

  // it("Fill Offer via Router API", async () =>
  //   testCase({
  //     executeByRouterAPI: true,
  //   }));

  it("Fill Listing via Router API", async () =>
    testCase({
      isListing: true,
      executeByRouterAPI: true,
    }));

  // it("Fill offer", async () => testCase({}));

  // it("Fill listing", async () =>
  //   testCase({
  //     isListing: true,
  //   }));

  // it("Fill listing with bulk Cancel", async () =>
  //   testCase({
  //     bulkCancel: true,
  //   }));
});
