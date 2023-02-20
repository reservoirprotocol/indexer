import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Blur from "@reservoir0x/sdk/src/blur";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../utils";

describe("Blur - Bulk Sign - SingleToken Erc721", () => {
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


  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const soldTokenId2 = 1;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Blur.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    await erc721.connect(seller).mint(soldTokenId2);

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

    const sellOrder2 = builder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: soldTokenId2,
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
    await Blur.Order.signBulk([
      sellOrder,
      sellOrder2
    ], seller);

    // Approve the exchange for escrowing.
    await erc721
      .connect(seller)
      .setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching({
      trader: buyer.address
    });


    const buyOrder2 = sellOrder2.buildMatching({
      trader: buyer.address
    });

    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const ownerBefore = await nft.getOwner(soldTokenId);
    const ownerBefore2 = await nft.getOwner(soldTokenId2);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, buyOrder);
    await exchange.fillOrder(buyer, sellOrder2, buyOrder2);

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const ownerAfter2 = await nft.getOwner(soldTokenId2);

    // console.log({
    //   ownerAfter,
    //   ownerBefore,
    // })

    // console.log({
    //   ownerAfter2,
    //   ownerBefore2
    // })

    expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.be.gt(price);
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price).add(price));
    expect(ownerAfter).to.eq(buyer.address);
    expect(ownerAfter2).to.eq(buyer.address);
  });


  it("Build and cancel sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const soldTokenId2 = 1;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Blur.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    await erc721.connect(seller).mint(soldTokenId2);

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

    const sellOrder2 = builder.build({
      side: "sell",
      trader: seller.address,
      collection: erc721.address,
      tokenId: soldTokenId2,
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
    await Blur.Order.signBulk([
      sellOrder,
      sellOrder2
    ], seller);

    // Approve the exchange for escrowing.
    await erc721
      .connect(seller)
      .setApprovalForAll(Blur.Addresses.ExecutionDelegate[chainId], true);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching({
      trader: buyer.address
    });

    const buyOrder2 = sellOrder2.buildMatching({
      trader: buyer.address
    });

    await exchange.cancelOrder(seller, sellOrder);

    let error = null;
    try {

      await sellOrder.checkFillability(ethers.provider);
    } catch(e: any) {
      error = e.toString();
    }

    expect(error).eq("Error: not-fillable");

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );

    // Match orders
    await exchange.fillOrder(buyer, sellOrder2, buyOrder2);

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter2 = await nft.getOwner(soldTokenId2);

    expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.be.gt(price);
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(ownerAfter2).to.eq(buyer.address);
  });

});
