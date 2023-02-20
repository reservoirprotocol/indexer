import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Blur from "@reservoir0x/sdk/src/blur";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../utils";

describe("Blur - SingleToken Erc721", () => {
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

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Blur.Addresses.ExecutionDelegate[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const exchange = new Blur.Exchange(chainId);

    const builder = new Blur.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      side: "buy",
      trader: buyer.address,
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      collection: erc721.address,
      tokenId: boughtTokenId,
      nonce: 0,
      amount: "1",
      paymentToken: Common.Addresses.Weth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      fees: [],
      extraParams: "0x",
      salt: 0,
    });

    // Sign the order
    await buyOrder.sign(buyer);

    // Approve the exchange for escrowing.
    await erc721
      .connect(seller)
      .setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

    // Create matching sell order
    const sellOrder = buyOrder.buildMatching({
      trader: seller.address,
    });

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

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Blur.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Blur.Addresses.ExecutionDelegate[chainId]);

    const exchange = new Blur.Exchange(chainId);

    const builder = new Blur.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: soldTokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: await getCurrentTimestamp(ethers.provider) + 86400,
      fees: [],
      salt: 0,
      extraParams: '0x'
    });

    // Sign the order
    await sellOrder.sign(seller);

    // Approve the exchange for escrowing.
    await erc721
      .connect(seller)
      .setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching({
      trader: buyer.address
    });

    // await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
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

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price.add(parseEther("0.15")));

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Blur.Addresses.ExecutionDelegate[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    const exchange = new Blur.Exchange(chainId);

    const builder = new Blur.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      side: "buy",
      trader: buyer.address,
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      collection: erc721.address,
      tokenId: boughtTokenId,
      nonce: 0,
      amount: "1",
      paymentToken: Common.Addresses.Weth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 86400,
      extraParams: "0x",
      salt: 0,
      fees: [
        {
          recipient: carol.address,
          rate: 100, // 100/10000 = 0.01
        },
        {
          recipient: ted.address,
          rate: 200, // 200/10000 = 0.02
        },
      ],
    });

    // Sign the order
    await buyOrder.sign(buyer);

    // Approve the exchange for escrowing.
    await erc721
      .connect(seller)
      .setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

    // Create matching sell order
    const sellOrder = buyOrder.buildMatching({
      trader: seller.address
    });

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

    expect(buyerBalanceAfter).to.eq(parseEther("0.15"));
    expect(carolBalanceAfter).to.eq(parseEther("0.01"));
    expect(tedBalanceAfter).to.eq(parseEther("0.02"));
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
    await nft.approve(seller, Blur.Addresses.ExecutionDelegate[chainId]);

    const exchange = new Blur.Exchange(chainId);

    const builder = new Blur.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: soldTokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: await getCurrentTimestamp(ethers.provider),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: await getCurrentTimestamp(ethers.provider) + 86400,
      salt: 0,
      extraParams: '0x',
      fees: [
        {
          recipient: carol.address,
          rate: 100
        },
        {
          recipient: ted.address,
          rate: 200
        },
      ],
    });

    // Sign the order
    await sellOrder.sign(seller);

    // Approve the exchange for escrowing.
    await erc721
      .connect(seller)
      .setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching({
      trader: buyer.address
    });

    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const carolBalanceBefore = await ethers.provider.getBalance(carol.address);
    const tedBalanceBefore = await ethers.provider.getBalance(ted.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, buyOrder, {
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const carolBalanceAfter = await ethers.provider.getBalance(carol.address);
    const tedBalanceAfter = await ethers.provider.getBalance(ted.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    // console.log({
    //   buyerBalanceAfter: buyerBalanceAfter.toString(),
    //   spend: buyerBalanceBefore.sub(buyerBalanceAfter).toString(),
    //   buyerBalanceBefore: buyerBalanceBefore.toString(),
    //   carolBalanceAfter: carolBalanceAfter.toString(),
    //   tedBalanceAfter: tedBalanceAfter.toString(),
    //   sellerBalanceBefore: sellerBalanceBefore.toString(),
    //   sellerBalanceAfter: sellerBalanceAfter.toString(),
    //   ownerAfter
    // })

    expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.be.gte(
      price
    );

    expect(carolBalanceAfter.sub(carolBalanceBefore)).to.eq(parseEther("0.01"));
    expect(tedBalanceAfter.sub(tedBalanceBefore)).to.eq(parseEther("0.02"));
    expect(sellerBalanceAfter).to.eq(
      sellerBalanceBefore.add(
        price.sub(parseEther("0.01")).sub(parseEther("0.02"))
      )
    );
    expect(ownerAfter).to.eq(buyer.address);
  });
});
