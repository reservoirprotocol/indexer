import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  getChainId,
  getCurrentTimestamp,
  lc,
  reset,
  setupNFTs,
} from "../../utils";

describe("[ReservoirV5_0_0] Fill ERC721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let referrer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc721: Contract;
  let router: Sdk.RouterV5.Router;

  beforeEach(async () => {
    [deployer, referrer, alice, bob, carol] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));

    router = new Sdk.RouterV5.Router(chainId, ethers.provider);
  });

  afterEach(reset);

  it("Seaport - fill listing", async () => {
    const buyer = alice;
    const seller = bob;
    const feeRecipient = carol;

    const price = parseEther("1");
    const fee = 250;
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    // Approve the exchange
    await erc721
      .connect(seller)
      .setApprovalForAll(Sdk.Seaport.Addresses.Exchange[chainId], true);

    // Build sell order
    const builder = new Sdk.Seaport.Builders.SingleToken(chainId);
    const sellOrder = builder.build({
      side: "sell",
      tokenKind: "erc721",
      offerer: seller.address,
      contract: erc721.address,
      tokenId: soldTokenId,
      paymentToken: Sdk.Common.Addresses.Eth[chainId],
      price: price.sub(price.mul(fee).div(10000)),
      fees: [
        {
          amount: price.mul(fee).div(10000),
          recipient: feeRecipient.address,
        },
      ],
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    const sellerEthBalanceBefore = await seller.getBalance();
    const routerEthBalanceBefore = await ethers.provider.getBalance(
      router.contract.address
    );
    const ownerBefore = await erc721.ownerOf(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const tx = await router.fillListingsTx(
      [
        {
          kind: "seaport",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Eth[chainId],
        },
      ],
      buyer.address,
      {
        source: "reservoir.market",
      }
    );
    await buyer.sendTransaction(tx);

    const sellerEthBalanceAfter = await seller.getBalance();
    const routerEthBalanceAfter = await ethers.provider.getBalance(
      router.contract.address
    );
    const ownerAfter = await erc721.ownerOf(soldTokenId);
    expect(sellerEthBalanceAfter.sub(sellerEthBalanceBefore)).to.eq(
      price.sub(price.mul(fee).div(10000))
    );
    expect(ownerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerEthBalanceAfter.sub(routerEthBalanceBefore)).to.eq(0);
  });

  it("Seaport - fill listing with fees on top", async () => {
    const buyer = alice;
    const seller = bob;
    const feeRecipient = carol;

    const price = parseEther("1");
    const fee = 250;
    const routerFee = 100;
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    // Approve the exchange
    await erc721
      .connect(seller)
      .setApprovalForAll(Sdk.Seaport.Addresses.Exchange[chainId], true);

    // Build sell order
    const builder = new Sdk.Seaport.Builders.SingleToken(chainId);
    const sellOrder = builder.build({
      side: "sell",
      tokenKind: "erc721",
      offerer: seller.address,
      contract: erc721.address,
      tokenId: soldTokenId,
      paymentToken: Sdk.Common.Addresses.Eth[chainId],
      price: price.sub(price.mul(fee).div(10000)),
      fees: [
        {
          amount: price.mul(fee).div(10000),
          recipient: feeRecipient.address,
        },
      ],
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    const referrerEthBalanceBefore = await referrer.getBalance();
    const sellerEthBalanceBefore = await seller.getBalance();
    const routerEthBalanceBefore = await ethers.provider.getBalance(
      router.contract.address
    );
    const ownerBefore = await erc721.ownerOf(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const tx = await router.fillListingsTx(
      [
        {
          kind: "seaport",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Eth[chainId],
        },
      ],
      buyer.address,
      {
        source: "reservoir.market",
        fee: { bps: routerFee, recipient: referrer.address },
      }
    );
    await buyer.sendTransaction(tx);

    const referrerEthBalanceAfter = await referrer.getBalance();
    const sellerEthBalanceAfter = await seller.getBalance();
    const routerEthBalanceAfter = await ethers.provider.getBalance(
      router.contract.address
    );
    const ownerAfter = await erc721.ownerOf(soldTokenId);
    expect(referrerEthBalanceAfter.sub(referrerEthBalanceBefore)).to.eq(
      price.mul(routerFee).div(10000)
    );
    expect(sellerEthBalanceAfter.sub(sellerEthBalanceBefore)).to.eq(
      price.sub(price.mul(fee).div(10000))
    );
    expect(ownerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerEthBalanceAfter.sub(routerEthBalanceBefore)).to.eq(0);

    // The precheck will trigger an early-revert
    await expect(buyer.sendTransaction(tx)).to.be.reverted;
  });

  it("Seaport - fill bid", async () => {
    const buyer = alice;
    const seller = bob;
    const feeRecipient = carol;

    const price = parseEther("1");
    const fee = parseEther("0.1");
    const boughtTokenId = 0;

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange for the buyer
    await weth.approve(buyer, Sdk.Seaport.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    // Approve the exchange for the seller
    await erc721
      .connect(seller)
      .setApprovalForAll(Sdk.Seaport.Addresses.Exchange[chainId], true);

    const builder = new Sdk.Seaport.Builders.SingleToken(chainId);

    // Build buy order
    let buyOrder = builder.build({
      offerer: buyer.address,
      tokenKind: "erc721",
      contract: erc721.address,
      tokenId: boughtTokenId,
      side: "buy",
      price,
      paymentToken: Sdk.Common.Addresses.Weth[chainId],
      fees: [
        {
          amount: fee,
          recipient: feeRecipient.address,
        },
      ],
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });
    await buyOrder.sign(buyer);

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const routerWethBalanceBefore = await weth.getBalance(
      router.contract.address
    );
    const ownerBefore = await erc721.ownerOf(boughtTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const tx = await router.fillBidTx(
      {
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: boughtTokenId.toString(),
        order: buyOrder,
      },
      seller.address,
      {
        source: "reservoir.market",
      }
    );
    await seller.sendTransaction(tx);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const routerWethBalanceAfter = await weth.getBalance(
      router.contract.address
    );
    const ownerAfter = await erc721.ownerOf(boughtTokenId);
    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.eq(price);
    expect(ownerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerWethBalanceAfter.sub(routerWethBalanceBefore)).to.eq(0);
  });

  it("LooksRare - fill listing", async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const fee = 150;
    const routerFee = 500;
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    // Approve the transfer manager
    await erc721
      .connect(seller)
      .setApprovalForAll(
        Sdk.LooksRare.Addresses.TransferManagerErc721[chainId],
        true
      );

    const exchange = new Sdk.LooksRare.Exchange(chainId);
    const builder = new Sdk.LooksRare.Builders.SingleToken(chainId);

    // Build sell order
    let sellOrder = builder.build({
      isOrderAsk: true,
      signer: seller.address,
      collection: erc721.address,
      tokenId: soldTokenId,
      currency: Sdk.Common.Addresses.Weth[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: await exchange.getNonce(ethers.provider, seller.address),
    });
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    const referrerEthBalanceBefore = await referrer.getBalance();
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const routerEthBalanceBefore = await ethers.provider.getBalance(
      router.contract.address
    );
    const routerWethBalanceBefore = await weth.getBalance(
      router.contract.address
    );
    const ownerBefore = await erc721.ownerOf(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const tx = await router.fillListingsTx(
      [
        {
          kind: "looks-rare",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Eth[chainId],
        },
      ],
      buyer.address,
      {
        source: "reservoir.market",
        fee: { bps: routerFee, recipient: referrer.address },
      }
    );
    await buyer.sendTransaction(tx);

    const referrerEthBalanceAfter = await referrer.getBalance();
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const routerEthBalanceAfter = await ethers.provider.getBalance(
      router.contract.address
    );
    const routerWethBalanceAfter = await weth.getBalance(
      router.contract.address
    );
    const ownerAfter = await erc721.ownerOf(soldTokenId);
    expect(referrerEthBalanceAfter.sub(referrerEthBalanceBefore)).to.eq(
      price.mul(routerFee).div(10000)
    );
    expect(sellerWethBalanceAfter.sub(sellerWethBalanceBefore)).to.eq(
      price.sub(price.mul(fee).div(10000))
    );
    expect(ownerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerEthBalanceAfter.sub(routerEthBalanceBefore)).to.eq(0);
    expect(routerWethBalanceAfter.sub(routerWethBalanceBefore)).to.eq(0);
  });

  it("LooksRare - fill bid", async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const boughtTokenId = 0;

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the token transfer proxy for the buyer
    await weth.approve(buyer, Sdk.LooksRare.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    // Approve the transfer proxy
    await erc721
      .connect(seller)
      .setApprovalForAll(
        Sdk.LooksRare.Addresses.TransferManagerErc721[chainId],
        true
      );

    const exchange = new Sdk.LooksRare.Exchange(chainId);
    const builder = new Sdk.LooksRare.Builders.SingleToken(chainId);

    // Build buy order
    let buyOrder = builder.build({
      isOrderAsk: false,
      signer: buyer.address,
      collection: erc721.address,
      tokenId: boughtTokenId,
      currency: Sdk.Common.Addresses.Weth[chainId],
      price,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      nonce: await exchange.getNonce(ethers.provider, buyer.address),
    });
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const routerWethBalanceBefore = await weth.getBalance(
      router.contract.address
    );
    const ownerBefore = await erc721.ownerOf(boughtTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const tx = await router.fillBidTx(
      {
        kind: "looks-rare",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: boughtTokenId.toString(),
        order: buyOrder,
      },
      seller.address
    );
    await seller.sendTransaction(tx);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const routerWethBalanceAfter = await weth.getBalance(
      router.contract.address
    );
    const ownerAfter = await erc721.ownerOf(boughtTokenId);
    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.eq(price);
    expect(ownerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerWethBalanceAfter.sub(routerWethBalanceBefore)).to.eq(0);
  });

  it("ZeroExV4 - fill listing", async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const routerFee = 150;
    const soldTokenId = 0;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    // Approve the exchange
    await erc721
      .connect(seller)
      .setApprovalForAll(Sdk.ZeroExV4.Addresses.Exchange[chainId], true);

    const builder = new Sdk.ZeroExV4.Builders.SingleToken(chainId);

    // Build sell order
    let sellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc721.address,
      tokenId: soldTokenId,
      paymentToken: Sdk.ZeroExV4.Addresses.Eth[chainId],
      price,
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
    });
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    const referrerEthBalanceBefore = await referrer.getBalance();
    const sellerEthBalanceBefore = await seller.getBalance();
    const routerEthBalanceBefore = await ethers.provider.getBalance(
      router.contract.address
    );
    const ownerBefore = await erc721.ownerOf(soldTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const tx = await router.fillListingsTx(
      [
        {
          kind: "zeroex-v4",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Eth[chainId],
        },
      ],
      buyer.address,
      {
        source: "reservoir.market",
        fee: { bps: routerFee, recipient: referrer.address },
      }
    );
    await buyer.sendTransaction(tx);

    const referrerEthBalanceAfter = await referrer.getBalance();
    const sellerEthBalanceAfter = await seller.getBalance();
    const routerEthBalanceAfter = await ethers.provider.getBalance(
      router.contract.address
    );
    const ownerAfter = await erc721.ownerOf(soldTokenId);
    expect(referrerEthBalanceAfter.sub(referrerEthBalanceBefore)).to.eq(
      price.mul(routerFee).div(10000)
    );
    expect(sellerEthBalanceAfter.sub(sellerEthBalanceBefore)).to.eq(price);
    expect(ownerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerEthBalanceAfter.sub(routerEthBalanceBefore)).to.eq(0);
  });

  it("ZeroExV4 - fill bid", async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const boughtTokenId = 0;

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, 1);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Sdk.ZeroExV4.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    // Approve the exchange
    await erc721
      .connect(seller)
      .setApprovalForAll(Sdk.ZeroExV4.Addresses.Exchange[chainId], true);

    const builder = new Sdk.ZeroExV4.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      direction: "buy",
      maker: buyer.address,
      contract: erc721.address,
      tokenId: boughtTokenId,
      paymentToken: Sdk.Common.Addresses.Weth[chainId],
      price,
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
    });
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const routerWethBalanceBefore = await weth.getBalance(
      router.contract.address
    );
    const ownerBefore = await erc721.ownerOf(boughtTokenId);
    expect(ownerBefore).to.eq(seller.address);

    const tx = await router.fillBidTx(
      {
        kind: "zeroex-v4",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: boughtTokenId.toString(),
        order: buyOrder,
      },
      seller.address,
      {
        source: "reservoir.market",
      }
    );
    await seller.sendTransaction(tx);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const routerWethBalanceAfter = await weth.getBalance(
      router.contract.address
    );
    const ownerAfter = await erc721.ownerOf(boughtTokenId);
    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.eq(price);
    expect(ownerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerWethBalanceAfter.sub(routerWethBalanceBefore)).to.eq(0);
  });

  it("Foundation - fill listing", async () => {
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const fee = 500;
    const routerFee = 100;
    const soldTokenId = 0;

    // Mint erc721 to seller.
    await erc721.connect(seller).mint(soldTokenId);

    // Approve the exchange.
    await erc721
      .connect(seller)
      .setApprovalForAll(Sdk.Foundation.Addresses.Exchange[chainId], true);

    const exchange = new Sdk.Foundation.Exchange(chainId);

    const sellOrder = new Sdk.Foundation.Order(chainId, {
      maker: seller.address,
      contract: erc721.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
    });

    // Create sell order.
    await exchange.createOrder(seller, sellOrder);

    const referrerEthBalanceBefore = await referrer.getBalance();
    const sellerEthBalanceBefore = await seller.getBalance();
    const routerEthBalanceBefore = await ethers.provider.getBalance(
      router.contract.address
    );
    const ownerBefore = await erc721.ownerOf(soldTokenId);
    expect(lc(ownerBefore)).to.eq(lc(exchange.contract.address));

    const tx = await router.fillListingsTx(
      [
        {
          kind: "foundation",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Eth[chainId],
        },
      ],
      buyer.address,
      {
        source: "reservoir.market",
        fee: { bps: routerFee, recipient: referrer.address },
      }
    );
    await buyer.sendTransaction(tx);

    const referrerEthBalanceAfter = await referrer.getBalance();
    const sellerEthBalanceAfter = await seller.getBalance();
    const routerEthBalanceAfter = await ethers.provider.getBalance(
      router.contract.address
    );
    const ownerAfter = await erc721.ownerOf(soldTokenId);
    expect(referrerEthBalanceAfter.sub(referrerEthBalanceBefore)).to.eq(
      price.mul(routerFee).div(10000)
    );
    expect(sellerEthBalanceAfter.sub(sellerEthBalanceBefore)).to.eq(
      price.sub(price.mul(fee).div(10000))
    );
    expect(ownerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerEthBalanceAfter.sub(routerEthBalanceBefore)).to.eq(0);
  });
});
