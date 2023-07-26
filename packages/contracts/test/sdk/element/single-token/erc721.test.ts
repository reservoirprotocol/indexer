import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Element from "@reservoir0x/sdk/src/element";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("Element - SingleToken Erc721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let ted: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, ted] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const boughtTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Element.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const exchange = new Element.Exchange(chainId);

    const builder = new Element.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      direction: "buy",
      maker: buyer.address,
      contract: erc721.address,
      tokenId: boughtTokenId,
      paymentToken: Common.Addresses.WNative[chainId],
      price,
      hashNonce: 0,
      expiry: (await getCurrentTimestamp(ethers.provider)) + 10000,
    });

    // Sign the order
    await buyOrder.sign(buyer);

    // Approve the exchange for escrowing.
    await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

    // Create matching sell order
    const sellOrder = buyOrder.buildMatching();

    await buyOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);

    const ownerBefore = await nft.getOwner(boughtTokenId);

    expect(buyerBalanceBefore).to.eq(price);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, sellOrder);

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(boughtTokenId);

    expect(buyerBalanceAfter).to.eq(0);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Element.Addresses.Exchange[chainId]);

    const exchange = new Element.Exchange(chainId);

    const builder = new Element.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc721.address,
      tokenId: soldTokenId,
      paymentToken: Element.Addresses.Native[chainId],
      price,
      hashNonce: 0,
      expiry: (await getCurrentTimestamp(ethers.provider)) + 100,
    });

    // Sign the order
    await sellOrder.sign(seller);

    // Approve the exchange for escrowing.
    await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching();

    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, buyOrder);

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.be.gt(price);
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill buy order with fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const boughtTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price.add(parseEther("0.15")));

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Element.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const exchange = new Element.Exchange(chainId);

    const builder = new Element.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      direction: "buy",
      maker: buyer.address,
      contract: erc721.address,
      tokenId: boughtTokenId,
      paymentToken: Common.Addresses.WNative[chainId],
      price,
      hashNonce: 0,
      fees: [
        {
          recipient: carol.address,
          amount: parseEther("0.1"),
        },
        {
          recipient: ted.address,
          amount: parseEther("0.05"),
        },
      ],
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await buyOrder.sign(buyer);

    // Approve the exchange for escrowing.
    await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

    // Create matching sell order
    const sellOrder = buyOrder.buildMatching();

    await buyOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const ownerBefore = await nft.getOwner(boughtTokenId);

    expect(buyerBalanceBefore).to.eq(price.add(parseEther("0.15")));
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, sellOrder);

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const carolBalanceAfter = await weth.getBalance(carol.address);
    const tedBalanceAfter = await weth.getBalance(ted.address);
    const ownerAfter = await nft.getOwner(boughtTokenId);

    expect(buyerBalanceAfter).to.eq(0);
    expect(carolBalanceAfter).to.eq(parseEther("0.1"));
    expect(tedBalanceAfter).to.eq(parseEther("0.05"));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill sell order with fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Element.Addresses.Exchange[chainId]);

    const exchange = new Element.Exchange(chainId);

    const builder = new Element.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc721.address,
      tokenId: soldTokenId,
      paymentToken: Element.Addresses.Native[chainId],
      price,
      hashNonce: 0,
      fees: [
        {
          recipient: carol.address,
          amount: parseEther("0.1"),
        },
        {
          recipient: ted.address,
          amount: parseEther("0.05"),
        },
      ],
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await sellOrder.sign(seller);

    // Approve the exchange for escrowing.
    await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching();

    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const carolBalanceBefore = await ethers.provider.getBalance(carol.address);
    const tedBalanceBefore = await ethers.provider.getBalance(ted.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, buyOrder, {
      source: "reservoir.market",
    });

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const carolBalanceAfter = await ethers.provider.getBalance(carol.address);
    const tedBalanceAfter = await ethers.provider.getBalance(ted.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.be.gt(price.add(parseEther("0.15")));
    expect(carolBalanceAfter.sub(carolBalanceBefore)).to.eq(parseEther("0.1"));
    expect(tedBalanceAfter.sub(tedBalanceBefore)).to.eq(parseEther("0.05"));
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });
});
