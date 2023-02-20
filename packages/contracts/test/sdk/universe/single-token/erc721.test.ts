import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Universe from "@reservoir0x/sdk/src/universe";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { constants } from "ethers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { bn, getChainId, reset, setupNFTs } from "../../../utils";

describe("Universe - SingleToken Erc721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dan: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, charlie, dan] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill ERC721 WETH buy order no revenue splits", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Universe.Addresses.Exchange[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);
    const daoFee = await exchange.getDaoFee(seller.provider!);

    const builder = new Universe.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      fees: [],
    });

    // Sign the order
    await buyOrder.sign(buyer);
    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      source: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price.sub(price.mul(daoFee).div(10000)));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill ERC721 WETH buy order with revenue splits", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Universe.Addresses.Exchange[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);
    const daoFee = await exchange.getDaoFee(seller.provider!);
    const revenueSplitBpsA = "1000";
    const revenueSplitBpsB = "1500";

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      fees: [
        `${charlie.address}:${revenueSplitBpsA}`,
        `${dan.address}:${revenueSplitBpsB}`,
      ],
    });

    // Sign the order
    await buyOrder.sign(buyer);
    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      source: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(bn(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );
    priceAfterFees = priceAfterFees.sub(priceAfterFees.mul(daoFee).div(10000));

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill ERC721 WETH sell order no revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Universe.Addresses.Exchange[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);
    const daoFee = await exchange.getDaoFee(buyer.provider!);

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build sell order

    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      fees: [],
    });

    // Sign the order
    await sellOrder.sign(seller);
    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      source: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(price.sub(price.mul(daoFee).div(10000)));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill ERC721 WETH sell order with revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Universe.Addresses.Exchange[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);
    const daoFee = await exchange.getDaoFee(buyer.provider!);
    const revenueSplitBpsA = "1000";
    const revenueSplitBpsB = "1500";

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      fees: [
        `${charlie.address}:${revenueSplitBpsA}`,
        `${dan.address}:${revenueSplitBpsB}`,
      ],
    });

    // Sign the order
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      source: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(bn(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );
    priceAfterFees = priceAfterFees.sub(priceAfterFees.mul(daoFee).div(10000));

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill ERC721 ETH sell order no revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);

    const daoFee = await exchange.getDaoFee(buyer.provider!);

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      fees: [],
    });

    // Sign the order
    await sellOrder.sign(seller);
    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      source: "reservoir.market",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(
      sellerBalanceBefore.add(price.sub(price.mul(daoFee).div(10000)))
    );
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill ERC721 ETH sell order with revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);

    const daoFee = await exchange.getDaoFee(buyer.provider!);
    const revenueSplitBpsA = "1000";
    const revenueSplitBpsB = "1500";

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      fees: [
        `${charlie.address}:${revenueSplitBpsA}`,
        `${dan.address}:${revenueSplitBpsB}`,
      ],
    });

    // Sign the order
    await sellOrder.sign(seller);
    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      source: "reservoir.market",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(bn(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );
    priceAfterFees = priceAfterFees.sub(priceAfterFees.mul(daoFee).div(10000));

    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and cancel ERC721 ETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const exchange = new Universe.Exchange(chainId);

    const builder = new Universe.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      fees: [],
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Build and cancel ERC721 WETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const exchange = new Universe.Exchange(chainId);

    const builder = new Universe.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      fees: [],
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Build and cancel ERC721 WETH buy order", async () => {
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const exchange = new Universe.Exchange(chainId);

    const builder = new Universe.Builders.SingleToken(chainId);

    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      fees: [],
    });

    await buyOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(buyer, buyOrder);

    const orderFill = await exchange.getOrderFill(buyer.provider!, buyOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });
});
