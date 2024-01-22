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

describe("Palette - ContractWide Erc1155", () => {
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
  });

  afterEach(async () => {
    // await reset();
  });

  it("Build and fill contract-wide buy order", async() => {
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
      kind: "contract-wide",
      sellerOrBuyer: buyer.address,
      price: price.toString(),
      amount: "1",
      referrer: constants.AddressZero,
      feePercentage: 0,
      hook: constants.AddressZero
    })

    const exchange = new Sdk.Palette.Exchange(chainId);

    await nft.approve(seller, orderbook1155.address);
    {

      console.log('createCollectionOffer')
      const transaction = await orderbook1155
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

      const fillTx = await exchange.acceptERC1155CollectionOffer(
        seller.address,
        [
          buyOrder
        ],
        [
          {
            tokenId
          }
        ]
      );

      console.log(fillTx)
      // const fillTx = await orderbook1155
      //   .connect(seller)
      //   .populateTransaction
      //   .acceptCollectionOffer(
      //     tokenId,
      //     [
      //       price
      //     ],
      //     true,
      //     '0x',
      //     {
      //       gasLimit: 1000000
      //     }
      // );

      const tx = await seller.sendTransaction(fillTx);
      const result = await indexerHelper.doEventParsing(tx.hash, false);
      // console.log('result', result)
    }

    if (orderInfo.id) {
      const orderState = await indexerHelper.getOrder(orderInfo.id);
      expect(orderState.fillability_status).eq('filled');
    }

    const balance = await nft.getBalance(buyer.address, tokenId);
    expect(balance).eq(1);
  })

  it("Build and cancel contract-wide buy order", async() => {
    const buyer = alice;
    const seller = bob;
    const tokenId = Math.floor(Math.random() * 100000);
    const price = parseEther("1");

    await erc1155.connect(seller).mint(tokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);
    let orderInfo: any  = {};

    const buyOrder = new Sdk.Palette.Order(chainId, {
      collection: erc721.address,
      orderbook: orderbook1155.address,
      side: "buy",
      kind: "contract-wide",
      sellerOrBuyer: buyer.address,
      price: price.toString(),
      amount: "1",
      referrer: constants.AddressZero,
      feePercentage: 0,
      hook: constants.AddressZero
    })

    await nft.approve(seller, orderbook1155.address);
    {
      const transaction = await orderbook1155
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

    {
      const orderHash = buyOrder.hash();
      const cancelTx = await orderbook1155
        .connect(buyer)
        .populateTransaction
        .cancelCollectionOffer(
          orderHash,
          {
            gasLimit: 1000000
          }
      );

      const tx = await buyer.sendTransaction(cancelTx);
      const result = await indexerHelper.doEventParsing(tx.hash, false);
      expect(result.events.find((c: any) => c.subKind === "palette-collection-offer-cancelled")).not.eq(undefined)
    }

    if (orderInfo.id) {
      const orderState = await indexerHelper.getOrder(orderInfo.id);
      expect(orderState.fillability_status).eq('cancelled');
    }
  })
});
