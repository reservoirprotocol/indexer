import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Rarible from "@reservoir0x/sdk/src/rarible";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, reset, setupNFTs } from "../../../../utils";
import { BigNumber, constants } from "ethers";

describe("Rarible - SingleToken Bids Erc721", () => {
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

  // TODO: Implement these
  it("Rarible V1 Order data - 2 origin fees - Build and fill ERC721 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "100";
    const revenueSplitBpsB = "150";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      startTime: 0,
      endTime: 0,
      maxFeesBasePoint: 1000,
      payouts: [{ account: buyer.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V1 Order data - 0 origin fees - Build and fill ERC721 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const buyerPayout = "9000";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      startTime: 0,
      endTime: 0,
      maxFeesBasePoint: 1000,
      payouts: [{ account: buyer.address, value: "10000" }],
      originFees: [],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V2 Order data - 2 origin fees - Build and fill ERC721 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const nftPrice = parseEther("0.2");
    const priceSent = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, priceSent);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "100";
    const revenueSplitBpsB = "150";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: nftPrice.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      startTime: 0,
      endTime: 0,
      maxFeesBasePoint: 1000,
      payouts: [{ account: buyer.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    let priceWithFees = nftPrice;
    priceWithFees = priceWithFees.add(
      priceWithFees.mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(priceSent.sub(priceWithFees));
    expect(buyerBalanceAfter).to.eq(nftPrice);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V2 Order data - 1 origin fees - Build and fill ERC721 WETH buy order", async () => {
    // Read this doc for info about how BID fees are calculated
    // https://github.com/rarible/protocol-contracts/blob/master/transfer-manager/contracts/RaribleTransferManager.md?plain=1#L68

    const seller = alice;
    const buyer = bob;
    const nftPrice = parseEther("0.2");
    const priceSent = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, priceSent);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "1000";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: nftPrice.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      startTime: 0,
      endTime: 0,
      payouts: [{ account: buyer.address, value: "10000" }],
      originFees: [{ account: charlie.address, value: revenueSplitBpsA }],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    let priceWithFees = nftPrice;
    priceWithFees = priceWithFees.add(
      priceWithFees.mul(BigNumber.from(revenueSplitBpsA)).div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(priceSent.sub(priceWithFees));
    expect(buyerBalanceAfter).to.eq(nftPrice);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V2 Order data - 0 origin fees - Build and fill ERC721 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "100";
    const revenueSplitBpsB = "150";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      startTime: 0,
      endTime: 0,
      maxFeesBasePoint: 1000,
      payouts: [{ account: buyer.address, value: "10000" }],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V3 Order data - 0 origin fees Build and fill ERC721 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_BUY,
      payouts: [{ account: buyer.address, value: "10000" }],
      marketplaceMarker: "rarible",
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
    });
    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V3 Order data - 1 origin fee Build and fill ERC721 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "100";
    const revenueSplitBpsB = "150";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_BUY,
      startTime: 0,
      endTime: 0,
      maxFeesBasePoint: 1000,
      originFeeFirst: {
        account: charlie.address,
        value: revenueSplitBpsA,
      },
      payouts: [],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA)).div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V3 Order data - 2 origin fees Build and fill ERC721 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "100";
    const revenueSplitBpsB = "150";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_BUY,
      startTime: 0,
      endTime: 0,
      maxFeesBasePoint: 1000,
      originFeeFirst: {
        account: charlie.address,
        value: revenueSplitBpsA,
      },
      originFeeSecond: {
        account: dan.address,
        value: revenueSplitBpsB,
      },
      payouts: [],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(buyerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });
});
