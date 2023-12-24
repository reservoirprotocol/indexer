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

  it("enforcePricingConstraints - Payment Coin", async () => {
    const buyer = alice;
    const seller = bob;
    const isListing = true;
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

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const policyId = await exchange.contract.connect(buyer).callStatic.createSecurityPolicy(
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      23000,
      "test"
    );

    const tx = await exchange.contract.connect(buyer).createSecurityPolicy(
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      23000,
      "test"
    );

   
    const result = await indexerHelper.doEventParsing(tx.hash, false);
   {
    const tx = await exchange.contract.connect(deployer).setCollectionPaymentCoin(erc721.address, Common.Addresses.Usdc[chainId]);
    const result = await indexerHelper.doEventParsing(tx.hash, false);
   }

   {

    const tx = await exchange.contract.connect(deployer).setCollectionSecurityPolicy(erc721.address, policyId);
    const result = await indexerHelper.doEventParsing(tx.hash, false);
   }
   

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
    expect(orderInfo.status).to.eq("payment-token-not-whitelisted");
  });


  it("enforcePricingConstraints - PricingBounds", async () => {
    const buyer = alice;
    const seller = bob;
    const isListing = true;
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

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const policyId = await exchange.contract.connect(buyer).callStatic.createSecurityPolicy(
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      23000,
      "test"
    );

    await exchange.contract.connect(buyer).createSecurityPolicy(
      false,
      false,
      true,
      false,
      false,
      false,
      false,
      23000,
      "test"
    );

    await exchange.contract.connect(deployer).setCollectionPricingBounds(erc721.address, {
      isEnabled: true,
      isImmutable: true,
      floorPrice: parseEther("10"),
      ceilingPrice: parseEther("100"),
    });

    await exchange.contract.connect(deployer).setCollectionSecurityPolicy(erc721.address, policyId);

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
    expect(orderInfo.status).to.eq("sale-price-below-minium-floor");
  });

});
