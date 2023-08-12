import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import * as Common from "@reservoir0x/sdk/src/common";
import * as PaymentProcessor from "@reservoir0x/sdk/src/payment-processor";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("PaymentProcessor - SingleToken", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessor.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const takerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      sellerAcceptedOffer: false,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      privateTaker: constants.AddressZero,
      trader: seller.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    const buyOrder = sellOrder.buildMatching({
      taker: buyer.address,
      takerMasterNonce: takerMasterNonce,
    });
    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    await exchange.fillOrder(buyer, sellOrder, buyOrder);

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, PaymentProcessor.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessor.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      sellerAcceptedOffer: true,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      trader: buyer.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    const buyOrder = builder.build(orderParameters);
    await buyOrder.sign(buyer);

    const sellOrder = buyOrder.buildMatching({
      taker: seller.address,
      takerMasterNonce: sellerMasterNonce,
    });
    await sellOrder.sign(seller);

    buyOrder.checkSignature();
    sellOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await weth.getBalance(seller.address);

    await exchange.fillOrder(seller, buyOrder, sellOrder);

    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and direct fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessor.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const takerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      sellerAcceptedOffer: false,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      privateTaker: constants.AddressZero,
      trader: seller.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    const buyOrder = sellOrder.buildMatching({
      taker: buyer.address,
      takerMasterNonce: takerMasterNonce,
    });
    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    sellOrder.checkSignature();

    await sellOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
        },
      ],
      buyer.address,
      Sdk.Common.Addresses.Native[chainId],
      {
        source: "reservoir.market",
      }
    );

    for (const tx of nonPartialTx.txs) {
      const preSignatures: string[] = [];
      for (const { data: preSignature, kind } of tx.preSignatures) {
        if (kind === "payment-processor-take-order") {
          const signature = await buyer._signTypedData(
            preSignature.domain,
            preSignature.types,
            preSignature.value
          );
          preSignatures.push(signature);
        }
      }

      const newTxData = exchange.attachTakerSignatures(tx.txData.data, preSignatures);
      tx.txData.data = newTxData;

      await buyer.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and direct fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const soldTokenId2 = 2;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price.mul(2));

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, PaymentProcessor.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    await erc721.connect(seller).mint(soldTokenId2);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessor.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      sellerAcceptedOffer: true,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      trader: buyer.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      coin: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    const buyOrder = builder.build(orderParameters);
    await buyOrder.sign(buyer);

    const sellOrder = buyOrder.buildMatching({
      taker: seller.address,
      takerMasterNonce: sellerMasterNonce,
    });
    await sellOrder.sign(seller);

    buyOrder.checkSignature();
    sellOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: 0,
      sellerAcceptedOffer: true,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      trader: buyer.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId2,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      coin: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    const buyOrder2 = builder.build(orderParameters2);
    await buyOrder2.sign(buyer);

    const sellOrder2 = buyOrder.buildMatching({
      taker: seller.address,
      takerMasterNonce: sellerMasterNonce,
    });
    await sellOrder2.sign(seller);

    buyOrder2.checkSignature();
    sellOrder2.checkSignature();

    const sellerBalanceBefore = await weth.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillBidsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: buyOrder,
          price: price.toString(),
        },
        {
          orderId: "1",
          kind: "payment-processor",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId2.toString(),
          order: buyOrder2,
          price: price.toString(),
        },
      ],
      seller.address,
      {
        source: "reservoir.market",
      }
    );

    for (const tx of nonPartialTx.txs) {
      const preSignatures: string[] = [];
      for (const { data: preSignature, kind } of tx.preSignatures) {
        if (kind === "payment-processor-take-order") {
          const signature = await seller._signTypedData(
            preSignature.domain,
            preSignature.types,
            preSignature.value
          );
          preSignatures.push(signature);
        }
      }

      const newTxData = exchange.attachTakerSignatures(tx.txData.data, preSignatures);
      tx.txData.data = newTxData;
      await seller.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const ownerAfter2 = await nft.getOwner(soldTokenId2);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price.mul(2));
    expect(ownerAfter).to.eq(buyer.address);
    expect(ownerAfter2).to.eq(buyer.address);
  });

  it("Build and direct fill with sweep", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessor.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessor.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const takerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      sellerAcceptedOffer: false,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      privateTaker: constants.AddressZero,
      trader: seller.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    const buyOrder = sellOrder.buildMatching({
      taker: buyer.address,
      takerMasterNonce: takerMasterNonce,
    });
    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    sellOrder.checkSignature();

    await sellOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
        },
      ],
      buyer.address,
      Sdk.Common.Addresses.Native[chainId],
      {
        source: "reservoir.market",
      }
    );

    for (const tx of nonPartialTx.txs) {
      const preSignatures: string[] = [];
      for (const { data: preSignature, kind } of tx.preSignatures) {
        if (kind === "payment-processor-take-order") {
          const signature = await buyer._signTypedData(
            preSignature.domain,
            preSignature.types,
            preSignature.value
          );
          preSignatures.push(signature);
        }
      }

      const newTxData = exchange.attachTakerSignatures(tx.txData.data, preSignatures);
      tx.txData.data = newTxData;

      await buyer.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });
});
