import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Rarible from "@reservoir0x/sdk/src/rarible";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, reset, setupNFTs } from "../../../../utils";
import { BigNumber, constants } from "ethers";

describe("Rarible - SingleToken Listings Erc721", () => {
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

  //TODO: Fix these
  it("Rarible V3 Order data - 0 origin fee Build and fill ERC721 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order

    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    try {
      await exchange.fillOrder(buyer, sellOrder, {
        referrer: "reservoir.market",
        tokenId: soldTokenId.toString(),
        assetClass: "ERC721",
      });
    } catch (err) {
      console.log("fail 1");
      console.log(err);
    }

    // try {
    //   await exchange.fillOrderOld(buyer, sellOrder, {
    //     referrer: "reservoir.market",
    //   });
    // } catch (err) {
    //   console.log("fail 2");
    //   console.log(err);
    //   throw Error();
    // }

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V3 Order data - 1 origin fee Build and fill ERC721 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "300";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: seller.address, value: "10000" }],
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA)).div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V3 Order data - 2 origin fees Build and fill ERC721 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: seller.address, value: "10000" }],
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      originFeeSecond: { account: dan.address, value: revenueSplitBpsB },
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V3 Order data - 0 origin fee Build and fill ERC721 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
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
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      referrer: "reservoir.market",
      assetClass: "ERC721",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(gasUsed).sub(price));
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V3 Order data - 1 origin fee Build and fill ERC721 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const revenueSplitBpsA = BigNumber.from(200);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
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
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [],
      originFeeFirst: {
        account: charlie.address,
        value: revenueSplitBpsA.toString(),
      },
      marketplaceMarker: "rarible",
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const charlieBalanceBefore = await ethers.provider.getBalance(charlie.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      referrer: "reservoir.market",
      assetClass: "ERC721",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const charlieBalanceAfter = await ethers.provider.getBalance(charlie.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(gasUsed).sub(price));
    expect(sellerBalanceAfter).to.be.eq(
      sellerBalanceBefore.add(price.sub(price.mul(revenueSplitBpsA).div(10000)))
    );
    expect(charlieBalanceAfter).to.be.eq;
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V3 Order data - 2 origin fees Build and fill ERC721 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);
    // console.log(asd);
    // console.log()

    const exchange = new Rarible.Exchange(chainId);

    const revenueSplitBpsA = "100";
    const revenueSplitBpsB = "150";

    const builder = new Rarible.Builders.SingleToken(chainId);
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
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      originFeeSecond: { account: dan.address, value: revenueSplitBpsB },
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      payouts: [{ account: seller.address, value: "10000" }],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const charlieBalanceBefore = await ethers.provider.getBalance(charlie.address);
    const danBalanceBefore = await ethers.provider.getBalance(dan.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
      amount: 1,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const charlieBalanceAfter = await ethers.provider.getBalance(charlie.address);
    const danBalanceAfter = await ethers.provider.getBalance(dan.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(gasUsed).sub(price));

    expect(charlieBalanceAfter).to.be.eq(
      charlieBalanceBefore.add(price.mul(revenueSplitBpsA).div(10000))
    );
    expect(danBalanceAfter).to.be.eq(danBalanceBefore.add(price.mul(revenueSplitBpsB).div(10000)));

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );

    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V1 Order data - 1 payout and 2 origin fees - Build and fill ERC721 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);
    // console.log(asd);
    // console.log()

    const exchange = new Rarible.Exchange(chainId);

    const revenueSplitBpsA = "100";
    const revenueSplitBpsB = "150";

    const builder = new Rarible.Builders.SingleToken(chainId);
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
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [{ account: seller.address, value: "10000" }],
      //originFees needs to be fixed
      originFees: [
        // {
        //   account: charlie.address,
        //   value: revenueSplitBpsA,
        // },
        // {
        //   account: dan.address,
        //   value: revenueSplitBpsB,
        // },
      ],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const charlieBalanceBefore = await ethers.provider.getBalance(charlie.address);
    const danBalanceBefore = await ethers.provider.getBalance(dan.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
      amount: 1,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const charlieBalanceAfter = await ethers.provider.getBalance(charlie.address);
    const danBalanceAfter = await ethers.provider.getBalance(dan.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(gasUsed).sub(price));

    // expect(charlieBalanceAfter).to.be.eq(charlieBalanceBefore.add(price.mul(revenueSplitBpsA).div(10000)));
    // expect(danBalanceAfter).to.be.eq(danBalanceBefore.add(price.mul(revenueSplitBpsB).div(10000)));

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );

    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V1 Order data - 2 payouts and 0 origin fees - Build and fill ERC721 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const revenueSplitBpsA = "1000";

    const builder = new Rarible.Builders.SingleToken(chainId);
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
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [
        { account: seller.address, value: "9000" },
        { account: dan.address, value: revenueSplitBpsA },
      ],
      originFees: [],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const danBalanceBefore = await ethers.provider.getBalance(dan.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
      amount: 1,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const danBalanceAfter = await ethers.provider.getBalance(dan.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(gasUsed).sub(price));

    // expect(danBalanceAfter).to.be.eq(danBalanceBefore.add(price.mul(revenueSplitBpsB).div(10000)));

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA)).div(10000)
    );

    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    // expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V2 Order data - 1 payout and 2 origin fees - Build and fill ERC721 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const revenueSplitBpsA = "1000";

    const builder = new Rarible.Builders.SingleToken(chainId);
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
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        {
          account: charlie.address,
          value: "1000",
        },
        {
          account: dan.address,
          value: "1000",
        },
      ],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const danBalanceBefore = await ethers.provider.getBalance(dan.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
      amount: 1,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const danBalanceAfter = await ethers.provider.getBalance(dan.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(gasUsed).sub(price));

    // expect(danBalanceAfter).to.be.eq(danBalanceBefore.add(price.mul(revenueSplitBpsB).div(10000)));

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(priceAfterFees.mul(BigNumber.from("2000")).div(10000));

    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V2 Order data - 2 payouts and 2 origin fees - Build and fill ERC721 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const revenueSplitBpsA = "1000";

    const builder = new Rarible.Builders.SingleToken(chainId);
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
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [
        { account: seller.address, value: "9000" },
        { account: charlie.address, value: "1000" },
      ],
      originFees: [
        {
          account: charlie.address,
          value: "1000",
        },
        {
          account: dan.address,
          value: "1000",
        },
      ],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const danBalanceBefore = await ethers.provider.getBalance(dan.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
      amount: 1,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const danBalanceAfter = await ethers.provider.getBalance(dan.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(gasUsed).sub(price));

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(priceAfterFees.mul(BigNumber.from("2800")).div(10000));

    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V2 Order data - 1 payout and 0 origin fees - Build and fill ERC721 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const revenueSplitBpsA = "1000";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.Native[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const danBalanceBefore = await ethers.provider.getBalance(dan.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
      amount: 1,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const danBalanceAfter = await ethers.provider.getBalance(dan.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(gasUsed).sub(price));

    // let priceAfterFees = price;
    // priceAfterFees = priceAfterFees.sub(
    //   priceAfterFees
    //     .mul(BigNumber.from('1000'))
    //     .div(10000)
    // );

    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V1 Order data - 1 payout and 2 origin fees - Build and fill ERC721 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [{ account: seller.address, value: "10000" }],
      //originFees needs to be fixed
      originFees: [
        // {
        //   account: charlie.address,
        //   value: revenueSplitBpsA,
        // },
        // {
        //   account: dan.address,
        //   value: revenueSplitBpsB,
        // },
      ],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V1 Order data - 2 payouts and 0 origin fees - Build and fill ERC721 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V2 Order data - 1 payout and 2 origin fees - Build and fill ERC721 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        { account: dan.address, value: revenueSplitBpsA },
        { account: charlie.address, value: revenueSplitBpsB },
      ],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
      amount: 1,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V2 Order data - 2 payouts and 2 origin fees - Build and fill ERC721 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";
    const sellerPayout = "9500";
    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [
        { account: seller.address, value: "9500" },
        { account: dan.address, value: "500" },
      ],
      originFees: [
        { account: dan.address, value: revenueSplitBpsA },
        { account: charlie.address, value: revenueSplitBpsB },
      ],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
      amount: 1,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    let priceAfterFees = price.mul(sellerPayout).div(10000);
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB)).div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(priceAfterFees);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Rarible V2 Order data - 1 payout and 0 origin fees - Build and fill ERC721 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.WNative[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(sellerBalanceBefore).to.eq(0);
    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      tokenId: soldTokenId.toString(),
      assetClass: "ERC721",
      referrer: "reservoir.market",
      amount: 1,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(price);
    expect(ownerAfter).to.eq(buyer.address);
  });


  it("Rarible V2_2 Order data - 2 payouts and 2 origin fees - Build and fill ERC721 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);
    const testOrder = new Rarible.Order(chainId, {
      "id": "ETHEREUM:0x80b1f4f7edeae2944e63ce8defe88e75705c8bd4cabc3f733e3f69f0826c045a",
      "fill": "0",
      "platform": "RARIBLE",
      "status": "ACTIVE",
      "endedAt": "2024-04-14T02:47:06Z",
      "makeStock": "2",
      "cancelled": false,
      "optionalRoyalties": false,
      "createdAt": "2024-03-15T02:53:23.456Z",
      "lastUpdatedAt": "2024-03-15T02:53:23.456Z",
      "makePrice": "0.0002",
      "makePriceUsd": "0.77891651929591434",
      "maker": "ETHEREUM:0xc2525dde2c83ddd03281737eeb69935dc27c340d",
      "make": {
          "type": {
              "@type": "ERC1155_Lazy",
              "contract": "ETHEREUM:0xb66a603f4cfe17e3d27b87a8bfcad319856518b8",
              "collection": "ETHEREUM:0xb66a603f4cfe17e3d27b87a8bfcad319856518b8",
              "tokenId": "87894221936671906037177106620291546568239087742262947616410832274754170257441",
              "uri": "/ipfs/bafkreicwqogkux5zoi2lwjf45dl2w7nc6cik7rblqaz6uuxyh3hfuhjoo4",
              "supply": "2",
              "creators": [
                  {
                      "account": "ETHEREUM:0xc2525dde2c83ddd03281737eeb69935dc27c340d",
                      "value": 10000
                  }
              ],
              "royalties": [
                  {
                      "account": "ETHEREUM:0xc2525dde2c83ddd03281737eeb69935dc27c340d",
                      "value": 1000
                  }
              ],
              "signatures": [
                  "0x6c2d3f912bcd11f49b89f14d1220f2d4309739e72e02c0bae3b714477917c3151e73bdacd4f635b578c8d4423db3b3555dae2eeb75615310c069c4bb247e3ae01b"
              ]
          },
          "value": "2"
      },
      "take": {
          "type": {
              "@type": "ETH",
              "blockchain": "ETHEREUM"
          },
          "value": "0.0004"
      },
      "salt": "0xbc3f77ae8db8f93365c8940a3fd855b332c8f899daded544246aacaa931783a5",
      "signature": "0xf0d11204eed589e90f9d67466e60ad1510bc19ec384bd2e7464c4c49fd55855c7afc0caae8d3e76a9063111cc6524f3e522e072bf1d07368b7918b44bd9bdef71c",
      "feeTakers": [
          "ETHEREUM:0x1cf0df2a5a20cd61d68d4489eebbf85b8d39e18a"
      ],
      "data": {
          "@type": "ETH_RARIBLE_V2_2",
          "payouts": [],
          "originFees": [
              {
                  "account": "ETHEREUM:0x1cf0df2a5a20cd61d68d4489eebbf85b8d39e18a",
                  "value": 750
              }
          ],
          "isMakeFill": true
      }
  } as any);

    try {
      testOrder.checkSignature();
    } catch {

    }
  });
});
