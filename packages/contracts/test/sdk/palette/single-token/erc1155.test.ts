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
import * as indexerHelper from "../../../indexer-helper";
import { getChainId, setupNFTs, getCurrentTimestamp } from "../../../utils";
import { setupPalette } from "../util";

describe("Palette - SingleToken Erc1155", () => {
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
    } = await setupPalette(deployer, erc1155.address, erc1155.address);
    if (orderbooks[0]) {
      orderbook721 = orderbooks[0]
    }
    if (orderbooks[1]) {
      orderbook1155 = orderbooks[1]
    }
  });

  afterEach(async () => {
    // await reset();
  });

  it("Build and fill sell order", async() => {
    const buyer = alice;
    const seller = bob;
    const tokenId = Math.floor(Math.random() * 100000);
    const price = parseEther("1");
    await erc1155.connect(seller).mint(tokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);
    let orderInfo: any = {};

    await nft.approve(seller, orderbook1155.address);
    {

      console.log("createListings")
      const transaction = await orderbook1155
        .connect(seller).populateTransaction
        .createListings(
          [
            tokenId
          ],
          [
            {
              originalLister: seller.address,
              price,
              tokenQuantity: 1,
              // 1155 listings have no private buyer or deadline
              privateBuyer: constants.AddressZero,
              deadline: 1,
              referrer: constants.AddressZero,
              feePercentage: 0,
              hook: constants.AddressZero
            }
          ],
          '0x',
          {
            gasLimit: 1000000
          }
      );

      const tx = await seller.sendTransaction(transaction);
      const recepiet = await tx.wait();
      const {
        onChainData
      } = await indexerHelper.doEventParsing(tx.hash, false);
      expect(onChainData[0].orders.length).eq(1);
      const order = onChainData[0].orders[0];
      const saveResult = await indexerHelper.doOrderSaving({
        contract: erc1155.address,
        kind: "erc1155",
        currency: Sdk.Common.Addresses.Native[chainId],
        // Refresh balance incase the local indexer doesn't have the state
        makers: [seller.address],
        nfts: [
          {
            collection: erc1155.address,
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

    {
      console.log("fillOrder")
      const fillTx = await orderbook1155.connect(buyer).populateTransaction.fillOrder(
        tokenId,
        [
          price
        ],
        true,
        '0x',
        {
          gasLimit: 1000000,
          value: price
        }
      );
      const tx = await buyer.sendTransaction(fillTx);
      const result = await indexerHelper.doEventParsing(tx.hash, false);
      console.log('result', result.onChainData[0].fillEventsOnChain)
    }

    if (orderInfo.id) {
      const orderState = await indexerHelper.getOrder(orderInfo.id);
      // console.log('orderState', orderInfo, orderState)
      // expect(orderState.fillability_status).eq('filled');
    }

    const amount = await nft.getBalance(buyer.address, tokenId.toString());
    expect(amount).to.eq(1);
  })

  it("Build and fill buy order", async() => {
    const buyer = alice;
    const seller = bob;
    const tokenId = Math.floor(Math.random() * 100000);
    const price = parseEther("1");

    await erc1155.connect(seller).mint(tokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    let orderInfo: any  = {};

    await nft.approve(seller, orderbook1155.address);
    {

      console.log('createSpecificBids')
      const transaction = await orderbook1155
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
        contract: erc1155.address,
        kind: "erc1155",
        currency: Sdk.Common.Addresses.Native[chainId],
        // Refresh balance incase the local indexer doesn't have the state
        makers: [seller.address],
        nfts: [
          {
            collection: erc1155.address,
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

    {

      console.log('acceptHighestSpecificBids')
      const fillTx = await orderbook1155
        .connect(seller)
        .populateTransaction
        .acceptHighestSpecificBids(
          tokenId,
          [
            1
          ],
          true,
          '0x',
          {
            gasLimit: 1000000
          }
      );
      console.log('sendTransaction')
      const tx = await seller.sendTransaction(fillTx);
      const result = await indexerHelper.doEventParsing(tx.hash, false);
      // console.log('result', result)
    }

    if (orderInfo.id) {
      const orderState = await indexerHelper.getOrder(orderInfo.id);
      expect(orderState.fillability_status).eq('filled');
    }

    const amount = await nft.getBalance(buyer.address, tokenId);
    expect(amount).eq(1);
  })

  it("Build and cancel sell order", async() => {
    const buyer = alice;
    const seller = bob;
    const tokenId = Math.floor(Math.random() * 100000);
    const price = parseEther("1");

    await erc1155.connect(seller).mint(tokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);
    let orderInfo: any  = {};

    const buyOrder = new Sdk.Palette.Order(chainId, {
      collection: erc1155.address,
      orderbook: orderbook1155.address,
      side: "buy",
      kind: "single-token",
      sellerOrBuyer: buyer.address,
      price: price.toString(),
      amount: "1",
      referrer: constants.AddressZero,
      feePercentage: 0,
      hook: constants.AddressZero
    })

    await nft.approve(seller, orderbook1155.address);
    {
      console.log('createSpecificBids')
      const transaction = await orderbook1155
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

      console.log('createSpecificBids send')

      const tx = await buyer.sendTransaction(transaction);
      const recepiet = await tx.wait();
      const {
        events,
        onChainData
      } = await indexerHelper.doEventParsing(tx.hash, false);
      expect(onChainData[0].orders.length).eq(1);

      const order = onChainData[0].orders[0];
      const saveResult = await indexerHelper.doOrderSaving({
        contract: erc1155.address,
        kind: "erc1155",
        currency: Sdk.Common.Addresses.Native[chainId],
        // Refresh balance incase the local indexer doesn't have the state
        makers: [seller.address],
        nfts: [
          {
            collection: erc1155.address,
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

    {
      console.log('removeSpecificBids')
      const orderHash = buyOrder.hash();
      const cancelTx = await orderbook1155
        .connect(buyer)
        .populateTransaction
        .removeSpecificBids(
          [
            tokenId
          ],
          [
            orderHash
          ],
          {
            gasLimit: 1000000
          }
      );

      const tx = await buyer.sendTransaction(cancelTx);
      const result = await indexerHelper.doEventParsing(tx.hash, false);
      // const cancelEventsOnChain = result.onChainData[0].cancelEventsOnChain;
      // console.log('cancelEventsOnChain', cancelEventsOnChain)
      expect(result.events.find((c: any) => c.subKind === "palette-specific-bid-removed-1155")).not.eq(undefined)
    }

    if (orderInfo.id) {
      const orderState = await indexerHelper.getOrder(orderInfo.id);
      expect(orderState.fillability_status).eq('cancelled');
    }
  })
});
