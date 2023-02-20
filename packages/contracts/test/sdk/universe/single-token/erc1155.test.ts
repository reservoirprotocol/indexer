import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Universe from "@reservoir0x/sdk/src/universe";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { constants } from "ethers";
import { expect } from "chai";
import { ethers } from "hardhat";

import { bn, getChainId, reset, setupNFTs } from "../../../utils";

describe("Universe - SingleToken Erc1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dan: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, charlie, dan] = await ethers.getSigners();

    ({ erc1155 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill ERC1155 WETH buy order no revenue splits", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Universe.Addresses.Exchange[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);
    const daoFee = await exchange.getDaoFee(seller.provider!);

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      fees: [],
    });

    // Sign the order
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      source: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price.sub(price.mul(daoFee).div(10000)));
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Build and partial fill ERC1155 WETH buy order no revenue splits", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Universe.Addresses.Exchange[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);
    const daoFee = await exchange.getDaoFee(seller.provider!);

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build sell order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      fees: [],
    });

    // Sign the order
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      source: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const filledPrice = price.div(mintTokensAmount).mul(fillAmount);

    expect(sellerBalanceAfter).to.be.eq(price.sub(filledPrice));
    expect(buyerBalanceAfter).to.eq(
      filledPrice.sub(filledPrice.mul(daoFee).div(10000))
    );
    expect(buyerNftBalanceAfter).to.eq(fillAmount);
    expect(sellerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
  });

  it("Build and fill ERC1155 WETH buy order with revenue splits", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Universe.Addresses.Exchange[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);
    const daoFee = await exchange.getDaoFee(seller.provider!);
    const revenueSplitBpsA = "1000";
    const revenueSplitBpsB = "1500";

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build sell order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
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
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      source: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(bn(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );
    priceAfterFees = priceAfterFees.sub(priceAfterFees.mul(daoFee).div(10000));

    expect(sellerBalanceAfter).to.eq(0);
    expect(buyerBalanceAfter).to.eq(priceAfterFees);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Build and fill ERC1155 WETH sell order no revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Universe.Addresses.Exchange[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);
    const daoFee = await exchange.getDaoFee(buyer.provider!);

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      fees: [],
    });

    // Sign the order
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      source: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(price.sub(price.mul(daoFee).div(10000)));
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });

  it("Build and partial fill ERC1155 WETH sell order no revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Universe.Addresses.Exchange[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);
    const daoFee = await exchange.getDaoFee(buyer.provider!);

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      fees: [],
    });

    // Sign the order
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      source: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    const filledPrice = price.div(mintTokensAmount).mul(fillAmount);

    expect(buyerBalanceAfter).to.be.eq(price.sub(filledPrice));

    expect(sellerBalanceAfter).to.eq(
      filledPrice.sub(filledPrice.mul(daoFee).div(10000))
    );

    expect(sellerNftBalanceAfter).to.eq(fillAmount);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
  });

  it("Build and fill ERC1155 WETH sell order with revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Universe.Addresses.Exchange[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

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
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
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

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      source: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(bn(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );
    priceAfterFees = priceAfterFees.sub(priceAfterFees.mul(daoFee).div(10000));

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(priceAfterFees);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });

  it("Build and fill ERC1155 ETH sell order no revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);

    const daoFee = await exchange.getDaoFee(buyer.provider!);

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      fees: [],
    });
    // Sign the order
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      source: "reservoir.market",
      amount: mintTokensAmount,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(
      sellerBalanceBefore.add(price.sub(price.mul(daoFee).div(10000)))
    );
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });

  it("Build and partial fill ERC1155 ETH sell order no revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Universe.Addresses.Exchange[chainId]);

    const exchange = new Universe.Exchange(chainId);

    const daoFee = await exchange.getDaoFee(buyer.provider!);

    const builder = new Universe.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      fees: [],
    });
    // Sign the order
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceBefore).eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      source: "reservoir.market",
      amount: fillAmount,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    const filledPrice = price.div(mintTokensAmount).mul(fillAmount);
    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(filledPrice)
    );

    expect(sellerBalanceAfter).to.eq(
      sellerBalanceBefore.add(
        filledPrice.sub(filledPrice.mul(daoFee).div(10000))
      )
    );
    expect(sellerNftBalanceAfter).eq(mintTokensAmount - fillAmount);
    expect(buyerNftBalanceAfter).eq(fillAmount);
  });

  it("Build and fill ERC1155 ETH sell order with revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

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
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
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
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceBefore).eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      source: "reservoir.market",
      amount: mintTokensAmount,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(bn(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );
    priceAfterFees = priceAfterFees.sub(priceAfterFees.mul(daoFee).div(10000));

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount);
  });

  it("Build and cancel ERC1155 ETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const exchange = new Universe.Exchange(chainId);

    const builder = new Universe.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
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

  it("Build and cancel ERC1155 WETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const exchange = new Universe.Exchange(chainId);

    const builder = new Universe.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
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

  it("Build and cancel ERC1155 WETH buy order", async () => {
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const exchange = new Universe.Exchange(chainId);

    const builder = new Universe.Builders.SingleToken(chainId);

    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
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
