import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Element from "@reservoir0x/sdk/src/element";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("Element - BatchSignedToken Erc721", () => {
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

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, Element.Addresses.Exchange[chainId]);

    const exchange = new Element.Exchange(chainId);

    const builder = new Element.Builders.BatchSignedToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      contract: erc721.address,
      tokenId: soldTokenId,
      paymentToken: Element.Addresses.Native[chainId],
      price,
      hashNonce: 0,
      listingTime: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 100,
      startNonce: Date.now(),
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

    const builder = new Element.Builders.BatchSignedToken(chainId);

    // Build sell order
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      contract: erc721.address,
      tokenId: soldTokenId,
      paymentToken: Element.Addresses.Native[chainId],
      price,
      hashNonce: 0,
      listingTime: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 100,
      startNonce: Date.now(),
      platformFeeRecipient: carol.address,
      platformFee: 1000,
      royaltyFeeRecipient: ted.address,
      royaltyFee: 500,
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

    expect(buyerBalanceBefore.sub(buyerBalanceAfter)).to.be.gt(price);
    expect(carolBalanceAfter.sub(carolBalanceBefore)).to.eq(parseEther("0.1"));
    expect(tedBalanceAfter.sub(tedBalanceBefore)).to.eq(parseEther("0.05"));
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price).sub(parseEther("0.15")));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Cancel sell order", async () => {
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

    const builder = new Element.Builders.BatchSignedToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      contract: erc721.address,
      tokenId: soldTokenId,
      paymentToken: Element.Addresses.Native[chainId],
      price,
      hashNonce: 0,
      listingTime: 0,
      expirationTime: (await getCurrentTimestamp(ethers.provider)) + 100,
      startNonce: Date.now(),
    });

    // Sign the order
    await sellOrder.sign(seller);

    // Approve the exchange for escrowing.
    await erc721.connect(seller).setApprovalForAll(Element.Addresses.Exchange[chainId], true);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching();

    await sellOrder.checkFillability(ethers.provider);

    await exchange.cancelOrder(seller, sellOrder);

    await expect(exchange.fillOrder(buyer, sellOrder, buyOrder)).to.be.revertedWith(
      "fillBatchSignedERC721Order: no order filled."
    );
  });
});
