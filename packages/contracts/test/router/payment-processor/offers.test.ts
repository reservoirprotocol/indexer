import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../utils";

describe("[ReservoirV6_0_1] - PaymentProcessor offers", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;
  let erc1155: Contract;
  let router: Contract;
  let paymentProcessorModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    paymentProcessorModule = await ethers
      .getContractFactory("PaymentProcessorModule", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.PaymentProcessor.Addresses.Exchange[chainId]
        )
      );
  });

  afterEach(reset);

  it("Build and fill ERC721 buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);
    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Sdk.PaymentProcessor.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    await erc721
      .connect(seller)
      .transferFrom(seller.address, paymentProcessorModule.address, tokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Sdk.PaymentProcessor.Addresses.Exchange[chainId]);
    await nft.approve(seller, paymentProcessorModule.address);

    const exchange = new Sdk.PaymentProcessor.Exchange(chainId);

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Sdk.PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 0,
      sellerAcceptedOffer: true,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      trader: buyer.address,
      tokenAddress: erc721.address,
      tokenId: tokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    // Build sell order
    const buyOrder = builder.build(orderParameters);
    await buyOrder.sign(buyer);

    const sellOrder = buyOrder.buildMatching({
      taker: paymentProcessorModule.address,
      takerMasterNonce: "0",
    });

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);

    await paymentProcessorModule.acceptOffers(
      [buyOrder.getMatchedOrder(sellOrder)],
      [buyOrder.params],
      {
        fillTo: seller.address,
        refundTo: seller.address,
        revertIfIncomplete: true,
        amount: price,
      },
      []
    );

    const sellerBalanceBefore = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(tokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill ERC721 contract-wide buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);
    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Sdk.PaymentProcessor.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(tokenId);
    await erc721
      .connect(seller)
      .transferFrom(seller.address, paymentProcessorModule.address, tokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Sdk.PaymentProcessor.Addresses.Exchange[chainId]);
    await nft.approve(seller, paymentProcessorModule.address);

    const exchange = new Sdk.PaymentProcessor.Exchange(chainId);

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Sdk.PaymentProcessor.Builders.ContractWide(chainId);
    const orderParameters = {
      protocol: 0,
      collectionLevelOffer: true,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      trader: buyer.address,
      tokenAddress: erc721.address,
      // tokenId: tokenId,
      amount: "1",
      price: price,
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    // Build sell order
    const buyOrder = builder.build(orderParameters);
    await buyOrder.sign(buyer);

    const sellOrder = buyOrder.buildMatching({
      taker: paymentProcessorModule.address,
      takerMasterNonce: "0",
      tokenId: tokenId,
    });

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    await paymentProcessorModule.acceptOffers(
      [buyOrder.getMatchedOrder(sellOrder)],
      [buyOrder.params],
      {
        fillTo: seller.address,
        refundTo: seller.address,
        revertIfIncomplete: true,
        amount: price,
      },
      []
    );

    const receiveAmount = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(tokenId);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill ERC1155 buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const tokenId = 1;
    const amount = 10;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);
    // Mint weth to buyer
    await weth.deposit(buyer, price.mul(amount));

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Sdk.PaymentProcessor.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(tokenId, amount);
    await erc1155
      .connect(seller)
      .safeTransferFrom(seller.address, paymentProcessorModule.address, tokenId, amount, "0x");

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, Sdk.PaymentProcessor.Addresses.Exchange[chainId]);
    await nft.approve(seller, paymentProcessorModule.address);

    const exchange = new Sdk.PaymentProcessor.Exchange(chainId);

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Sdk.PaymentProcessor.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: 1,
      sellerAcceptedOffer: true,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      trader: buyer.address,
      tokenAddress: erc1155.address,
      tokenId: tokenId,
      amount: amount,
      price: price.mul(amount),
      expiration: (blockTime + 60 * 60).toString(),
      nonce: "0",
      coin: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    // Build sell order
    const buyOrder = builder.build(orderParameters);
    await buyOrder.sign(buyer);

    const sellOrder = buyOrder.buildMatching({
      taker: paymentProcessorModule.address,
      takerMasterNonce: "0",
    });

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    await paymentProcessorModule.acceptOffers(
      [buyOrder.getMatchedOrder(sellOrder)],
      [buyOrder.params],
      {
        fillTo: seller.address,
        refundTo: seller.address,
        revertIfIncomplete: true,
        amount: price.mul(amount),
      },
      []
    );

    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, tokenId);
    const receiveAmount = await weth.getBalance(seller.address);

    expect(receiveAmount).to.gte(price.mul(amount));
    expect(buyerNftBalanceAfter).to.eq(amount);
  });
});
