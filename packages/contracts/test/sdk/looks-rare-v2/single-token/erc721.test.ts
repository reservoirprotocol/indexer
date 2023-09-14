import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as LooksRareV2 from "@reservoir0x/sdk/src/looks-rare-v2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("LooksRareV2 - SingleToken Erc721", () => {
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

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const boughtTokenId = 1;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, LooksRareV2.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, LooksRareV2.Addresses.TransferManager[chainId]);

    const exchange = new LooksRareV2.Exchange(chainId);

    await exchange.grantApprovals(seller, [LooksRareV2.Addresses.Exchange[chainId]]);
    await exchange.grantApprovals(buyer, [LooksRareV2.Addresses.Exchange[chainId]]);

    const builder = new LooksRareV2.Builders.SingleToken(chainId);

    const orderParameters = {
      quoteType: LooksRareV2.Types.QuoteType.Bid,
      strategyId: 0,
      collectionType: LooksRareV2.Types.CollectionType.ERC721,
      signer: buyer.address,
      collection: erc721.address,
      itemId: boughtTokenId,
      amount: 1,
      currency: Common.Addresses.WNative[chainId],
      price,
      globalNonce: await exchange.getGlobalNonce(ethers.provider, buyer.address, "buy"),
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 86400 * 31,
    };

    // Build buy order
    const buyOrder = builder.build(orderParameters);
    // Sign the order
    await buyOrder.sign(buyer);

    // Create matching sell order
    const sellOrder = buyOrder.buildMatching(seller.address);

    await buyOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    const ownerBefore = await nft.getOwner(boughtTokenId);

    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, sellOrder);

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(boughtTokenId);

    expect(buyerBalanceAfter).to.eq(0);

    expect(sellerBalanceAfter).to.eq(price.sub(price.mul(50).div(10000)));

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

    // Approve the transfer manager
    await nft.approve(seller, LooksRareV2.Addresses.TransferManager[chainId]);

    const exchange = new LooksRareV2.Exchange(chainId);

    await exchange.grantApprovals(seller, [LooksRareV2.Addresses.Exchange[chainId]]);

    await exchange.grantApprovals(buyer, [LooksRareV2.Addresses.Exchange[chainId]]);

    const builder = new LooksRareV2.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      quoteType: LooksRareV2.Types.QuoteType.Ask,
      strategyId: 0,
      collectionType: LooksRareV2.Types.CollectionType.ERC721,
      signer: seller.address,
      collection: erc721.address,
      itemId: soldTokenId,
      currency: Common.Addresses.Native[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      globalNonce: await exchange.getGlobalNonce(ethers.provider, buyer.address, "sell"),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await sellOrder.sign(seller);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching(buyer.address);

    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    // expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders,
    // const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    await exchange.fillOrder(buyer, sellOrder, buyOrder, {
      source: "reservoir.market",
    });

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerBalanceAfter).to.be.lt(buyerBalanceBefore.sub(price));

    expect(receiveAmount).to.gte(price.sub(price.mul(50).div(10000)));
    expect(ownerAfter).to.eq(buyer.address);
  });
});
