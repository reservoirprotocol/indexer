import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as LooksRare from "@reservoir0x/sdk/src/looks-rare";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
} from "../../../utils";

describe("LooksRare - SingleToken Erc1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc1155 } = await setupNFTs(deployer));
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
    await weth.approve(buyer, LooksRare.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(
      seller,
      LooksRare.Addresses.TransferManagerErc1155[chainId]
    );

    const exchange = new LooksRare.Exchange(chainId);

    const builder = new LooksRare.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      isOrderAsk: false,
      signer: buyer.address,
      collection: erc1155.address,
      tokenId: boughtTokenId,
      currency: Common.Addresses.Weth[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: await exchange.getNonce(ethers.provider, buyer.address),
    });

    // Sign the order
    await buyOrder.sign(buyer);

    // Create matching sell order
    const sellOrder = buyOrder.buildMatching(seller.address);

    await buyOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    const ownerBalanceBefore = await nft.getBalance(
      seller.address,
      boughtTokenId
    );

    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBalanceBefore).to.eq(1);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, sellOrder);

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerBalanceAfter = await nft.getBalance(
      seller.address,
      boughtTokenId
    );

    expect(buyerBalanceAfter).to.eq(0);
    expect(sellerBalanceAfter).to.eq(price.sub(price.mul(150).div(10000)));
    expect(ownerBalanceAfter).to.eq(0);
  });

  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(
      seller,
      LooksRare.Addresses.TransferManagerErc1155[chainId]
    );

    const exchange = new LooksRare.Exchange(chainId);

    const builder = new LooksRare.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      isOrderAsk: true,
      signer: seller.address,
      collection: erc1155.address,
      tokenId: soldTokenId,
      // LooksRare sell orders are in WETH
      currency: Common.Addresses.Weth[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: await exchange.getNonce(ethers.provider, seller.address),
    });

    // Sign the order
    await sellOrder.sign(seller);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching(buyer.address);

    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    const ownerBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBalanceBefore).to.eq(1);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, buyOrder);

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerBalanceAfter = await nft.getBalance(seller.address, soldTokenId);

    expect(buyerBalanceAfter).to.be.lt(buyerBalanceBefore.sub(price));
    expect(sellerBalanceAfter).to.eq(price.sub(price.mul(150).div(10000)));
    expect(ownerBalanceAfter).to.eq(0);
  });
});
