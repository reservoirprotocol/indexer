import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as SeaportV14 from "@reservoir0x/sdk/src/seaport-v1.4";
import { Builders } from "@reservoir0x/sdk/src/seaport-base";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { bn, getChainId, getCurrentTimestamp, reset, setupNFTs, setupTokens } from "../../../utils";

describe("SeaportV14 - SingleToken Erc721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let ted: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc20: Contract;
  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, ted, carol] = await ethers.getSigners();

    ({ erc20 } = await setupTokens(deployer));
    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV14.Addresses.Exchange[chainId]);

    const exchange = new SeaportV14.Exchange(chainId);

    const builder = new Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build(
      {
        side: "sell",
        tokenKind: "erc721",
        offerer: seller.address,
        contract: erc721.address,
        tokenId: soldTokenId,
        paymentToken: Common.Addresses.Native[chainId],
        price,
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      SeaportV14.Order
    );

    // Sign the order
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = sellOrder.buildMatching();

    const buyerEthBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, matchParams, {
      source: "reservoir.market",
    });

    const buyerEthBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(price);
    expect(sellerEthBalanceAfter).to.eq(sellerEthBalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });

  for (let i = 1; i < 13; i++) {
    it(`Build and fill ${i} bulk-signed sell orders`, async () => {
      const buyer = alice;
      const seller = bob;

      const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
      const exchange = new SeaportV14.Exchange(chainId);
      const builder = new Builders.SingleToken(chainId);

      // Approve the exchange
      await nft.approve(seller, SeaportV14.Addresses.Exchange[chainId]);

      const price = parseEther("1");

      const orders: SeaportV14.Order[] = [];
      for (let j = 0; j < i; j++) {
        // Mint erc721 to seller
        await erc721.connect(seller).mint(j);

        // Build sell order
        const order = builder.build(
          {
            side: "sell",
            tokenKind: "erc721",
            offerer: seller.address,
            contract: erc721.address,
            tokenId: j,
            paymentToken: Common.Addresses.Native[chainId],
            price,
            counter: 0,
            startTime: await getCurrentTimestamp(ethers.provider),
            endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
          },
          SeaportV14.Order
        );
        orders.push(order);
      }

      // Bulk-sign orders
      await exchange.bulkSign(seller, orders);
      for (const order of orders) {
        await order.checkSignature(ethers.provider);
      }

      const buyerEthBalanceBefore = await ethers.provider.getBalance(buyer.address);
      const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);

      // Match orders
      await exchange.fillOrders(
        buyer,
        orders,
        orders.map((o) => o.buildMatching()),
        {
          source: "reservoir.market",
        }
      );

      const buyerEthBalanceAfter = await ethers.provider.getBalance(buyer.address);
      const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);

      expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(price.mul(i));
      expect(sellerEthBalanceAfter).to.eq(sellerEthBalanceBefore.add(price.mul(i)));

      for (let j = 0; j < i; j++) {
        expect(await nft.getOwner(j)).to.eq(buyer.address);
      }
    });
  }

  it("Build and fill ERC20 sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV14.Addresses.Exchange[chainId]);

    // Mint erc20 to buyer
    await erc20.connect(buyer).mint(price);

    // Approve the exchange
    await erc20.connect(buyer).approve(SeaportV14.Addresses.Exchange[chainId], price);

    const exchange = new SeaportV14.Exchange(chainId);
    const builder = new Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build(
      {
        side: "sell",
        tokenKind: "erc721",
        offerer: seller.address,
        contract: erc721.address,
        tokenId: soldTokenId,
        paymentToken: erc20.address,
        price,
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      SeaportV14.Order
    );

    // Sign the order
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = sellOrder.buildMatching();

    const buyerErc20BalanceBefore = await erc20.balanceOf(buyer.address);
    const sellerErc20BalanceBefore = await erc20.balanceOf(seller.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, matchParams, {
      source: "reservoir.market",
    });

    const buyerErc20BalanceAfter = await erc20.balanceOf(buyer.address);
    const sellerErc20BalanceAfter = await erc20.balanceOf(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerErc20BalanceBefore.sub(buyerErc20BalanceAfter)).to.eq(price);
    expect(sellerErc20BalanceAfter).to.eq(sellerErc20BalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Dutch auction order's price is properly computed", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV14.Addresses.Exchange[chainId]);

    const builder = new Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build(
      {
        side: "sell",
        tokenKind: "erc721",
        offerer: seller.address,
        contract: erc721.address,
        tokenId: soldTokenId,
        paymentToken: Common.Addresses.Native[chainId],
        price,
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 10000,
      },
      SeaportV14.Order
    );
    sellOrder.params.consideration[0].endAmount = price.div(2).toString();

    expect(bn(sellOrder.getMatchingPrice(sellOrder.params.startTime + 1000))).to.eq(
      price.sub(price.div(2).mul(10).div(100))
    );
  });

  it("Build and fill sell order with fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const feeRecipient1 = ted;
    const fee1 = parseEther("0.025");
    const feeRecipient2 = carol;
    const fee2 = parseEther("0.05");
    const soldTokenId = 99;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV14.Addresses.Exchange[chainId]);

    const exchange = new SeaportV14.Exchange(chainId);

    const builder = new Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build(
      {
        side: "sell",
        tokenKind: "erc721",
        offerer: seller.address,
        contract: erc721.address,
        tokenId: soldTokenId,
        paymentToken: Common.Addresses.Native[chainId],
        price,
        fees: [
          {
            amount: fee1,
            recipient: feeRecipient1.address,
          },
          {
            amount: fee2,
            recipient: feeRecipient2.address,
          },
        ],
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      SeaportV14.Order
    );

    // Sign the order
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = sellOrder.buildMatching();

    const buyerEthBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceBefore = await ethers.provider.getBalance(seller.address);
    const feeRecipient1EthBalanceBefore = await ethers.provider.getBalance(feeRecipient1.address);
    const feeRecipient2EthBalanceBefore = await ethers.provider.getBalance(feeRecipient2.address);
    const ownerBefore = await nft.getOwner(soldTokenId);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, matchParams);

    const buyerEthBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerEthBalanceAfter = await ethers.provider.getBalance(seller.address);
    const feeRecipient1EthBalanceAfter = await ethers.provider.getBalance(feeRecipient1.address);
    const feeRecipient2EthBalanceAfter = await ethers.provider.getBalance(feeRecipient2.address);
    const ownerAfter = await nft.getOwner(soldTokenId);

    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(price);
    expect(sellerEthBalanceAfter).to.eq(sellerEthBalanceBefore.add(price));
    expect(feeRecipient1EthBalanceAfter.sub(feeRecipient1EthBalanceBefore)).to.eq(fee1);
    expect(feeRecipient2EthBalanceAfter.sub(feeRecipient2EthBalanceBefore)).to.eq(fee2);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const boughtTokenId = 10;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange
    await weth.approve(buyer, SeaportV14.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV14.Addresses.Exchange[chainId]);

    const exchange = new SeaportV14.Exchange(chainId);

    const builder = new Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build(
      {
        side: "buy",
        tokenKind: "erc721",
        offerer: buyer.address,
        contract: erc721.address,
        tokenId: boughtTokenId,
        paymentToken: Common.Addresses.WNative[chainId],
        price,
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      SeaportV14.Order
    );

    // Sign the order
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = buyOrder.buildMatching();

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const ownerBefore = await nft.getOwner(boughtTokenId);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, matchParams);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(boughtTokenId);

    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.eq(price);
    expect(sellerWethBalanceAfter).to.eq(sellerWethBalanceBefore.add(price));
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill buy order with fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const feeRecipient1 = ted;
    const fee1 = parseEther("0.1");
    const feeRecipient2 = carol;
    const fee2 = parseEther("0.00025");
    const boughtTokenId = 10;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange
    await weth.approve(buyer, SeaportV14.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV14.Addresses.Exchange[chainId]);

    const exchange = new SeaportV14.Exchange(chainId);

    const builder = new Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build(
      {
        side: "buy",
        tokenKind: "erc721",
        offerer: buyer.address,
        contract: erc721.address,
        tokenId: boughtTokenId,
        paymentToken: Common.Addresses.WNative[chainId],
        price,
        fees: [
          {
            amount: fee1,
            recipient: feeRecipient1.address,
          },
          {
            amount: fee2,
            recipient: feeRecipient2.address,
          },
        ],
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      },
      SeaportV14.Order
    );

    // Sign the order
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = buyOrder.buildMatching();

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const feeRecipient1WethBalanceBefore = await weth.getBalance(feeRecipient1.address);
    const feeRecipient2WethBalanceBefore = await weth.getBalance(feeRecipient2.address);
    const ownerBefore = await nft.getOwner(boughtTokenId);

    expect(ownerBefore).to.eq(seller.address);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, matchParams);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const feeRecipient1WethBalanceAfter = await weth.getBalance(feeRecipient1.address);
    const feeRecipient2WethBalanceAfter = await weth.getBalance(feeRecipient2.address);
    const ownerAfter = await nft.getOwner(boughtTokenId);

    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.eq(price);
    expect(sellerWethBalanceAfter).to.eq(
      sellerWethBalanceBefore.add(price).sub(buyOrder.getFeeAmount())
    );
    expect(feeRecipient1WethBalanceAfter.sub(feeRecipient1WethBalanceBefore)).to.eq(fee1);
    expect(feeRecipient2WethBalanceAfter.sub(feeRecipient2WethBalanceBefore)).to.eq(fee2);
    expect(ownerAfter).to.eq(buyer.address);
  });
});
