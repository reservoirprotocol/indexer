import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as SeaportV12 from "@reservoir0x/sdk/src/seaport-v1.2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
} from "../../../utils";

describe("SeaportV12 - SingleToken Erc1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let ted: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, ted, carol] = await ethers.getSigners();

    ({ erc1155 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV12.Addresses.Exchange[chainId]);

    const exchange = new SeaportV12.Exchange(chainId);

    const builder = new SeaportV12.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      side: "sell",
      tokenKind: "erc1155",
      offerer: seller.address,
      contract: erc1155.address,
      tokenId: soldTokenId,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = sellOrder.buildMatching();

    const buyerEthBalanceBefore = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerEthBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceBefore).to.eq(1);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, matchParams);

    const buyerEthBalanceAfter = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerEthBalanceAfter = await ethers.provider.getBalance(
      seller.address
    );
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(1);
    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(price);
    expect(sellerEthBalanceAfter).to.eq(sellerEthBalanceBefore.add(price));
  });

  it("Build and fill sell order with partial filling", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const totalAmount = 10;
    const amountFilled = 2;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, totalAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV12.Addresses.Exchange[chainId]);

    const exchange = new SeaportV12.Exchange(chainId);

    const builder = new SeaportV12.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      side: "sell",
      tokenKind: "erc1155",
      offerer: seller.address,
      contract: erc1155.address,
      tokenId: soldTokenId,
      amount: totalAmount,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = sellOrder.buildMatching({ amount: amountFilled });

    const buyerEthBalanceBefore = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerEthBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceBefore).to.eq(10);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, matchParams);

    const buyerEthBalanceAfter = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerEthBalanceAfter = await ethers.provider.getBalance(
      seller.address
    );
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceAfter).to.eq(8);
    expect(buyerNftBalanceAfter).to.eq(2);
    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(
      price.mul(amountFilled).div(totalAmount)
    );
    expect(sellerEthBalanceAfter).to.eq(
      sellerEthBalanceBefore.add(price.mul(amountFilled).div(totalAmount))
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

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV12.Addresses.Exchange[chainId]);

    const exchange = new SeaportV12.Exchange(chainId);

    const builder = new SeaportV12.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      side: "sell",
      tokenKind: "erc1155",
      offerer: seller.address,
      contract: erc1155.address,
      tokenId: soldTokenId,
      paymentToken: Common.Addresses.Eth[chainId],
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
    });

    // Sign the order
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = sellOrder.buildMatching();

    const buyerEthBalanceBefore = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerEthBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const feeRecipient1EthBalanceBefore = await ethers.provider.getBalance(
      feeRecipient1.address
    );
    const feeRecipient2EthBalanceBefore = await ethers.provider.getBalance(
      feeRecipient2.address
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceBefore).to.eq(1);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, matchParams);

    const buyerEthBalanceAfter = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerEthBalanceAfter = await ethers.provider.getBalance(
      seller.address
    );
    const feeRecipient1EthBalanceAfter = await ethers.provider.getBalance(
      feeRecipient1.address
    );
    const feeRecipient2EthBalanceAfter = await ethers.provider.getBalance(
      feeRecipient2.address
    );
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(1);
    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(price);
    expect(sellerEthBalanceAfter).to.eq(sellerEthBalanceBefore.add(price));
    expect(
      feeRecipient1EthBalanceAfter.sub(feeRecipient1EthBalanceBefore)
    ).to.eq(fee1);
    expect(
      feeRecipient2EthBalanceAfter.sub(feeRecipient2EthBalanceBefore)
    ).to.eq(fee2);
  });

  it("Build and fill sell order with partial filling and fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const feeRecipient = ted;
    const fee = parseEther("0.001");
    const totalAmount = 10;
    const amountFilled = 2;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, totalAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV12.Addresses.Exchange[chainId]);

    const exchange = new SeaportV12.Exchange(chainId);

    const builder = new SeaportV12.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      side: "sell",
      tokenKind: "erc1155",
      offerer: seller.address,
      contract: erc1155.address,
      tokenId: soldTokenId,
      amount: totalAmount,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
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

    // Sign the order
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = sellOrder.buildMatching({ amount: amountFilled });

    const buyerEthBalanceBefore = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerEthBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const feeRecipientEthBalanceBefore = await ethers.provider.getBalance(
      feeRecipient.address
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceBefore).to.eq(10);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, matchParams);

    const buyerEthBalanceAfter = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerEthBalanceAfter = await ethers.provider.getBalance(
      seller.address
    );
    const feeRecipientEthBalanceAfter = await ethers.provider.getBalance(
      feeRecipient.address
    );
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceAfter).to.eq(8);
    expect(buyerNftBalanceAfter).to.eq(2);
    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(
      price.mul(amountFilled).div(totalAmount)
    );
    expect(sellerEthBalanceAfter).to.eq(
      sellerEthBalanceBefore.add(price.mul(amountFilled).div(totalAmount))
    );
    expect(feeRecipientEthBalanceAfter.sub(feeRecipientEthBalanceBefore)).to.eq(
      fee.mul(amountFilled).div(totalAmount)
    );
  });

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const boughtTokenId = 10;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange
    await weth.approve(buyer, SeaportV12.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV12.Addresses.Exchange[chainId]);

    const exchange = new SeaportV12.Exchange(chainId);

    const builder = new SeaportV12.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      side: "buy",
      tokenKind: "erc1155",
      offerer: buyer.address,
      contract: erc1155.address,
      tokenId: boughtTokenId,
      paymentToken: Common.Addresses.Weth[chainId],
      price,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = buyOrder.buildMatching();

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      boughtTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      boughtTokenId
    );

    expect(sellerNftBalanceBefore).to.eq(1);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, matchParams);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      boughtTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      boughtTokenId
    );

    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(1);
    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.eq(price);
    expect(sellerWethBalanceAfter).to.eq(sellerWethBalanceBefore.add(price));
  });

  it("Build and fill buy order with partial filling", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 10;
    const totalAmount = 10;
    const amountFilled = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange
    await weth.approve(buyer, SeaportV12.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, totalAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV12.Addresses.Exchange[chainId]);

    const exchange = new SeaportV12.Exchange(chainId);

    const builder = new SeaportV12.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      side: "buy",
      tokenKind: "erc1155",
      offerer: buyer.address,
      contract: erc1155.address,
      tokenId: soldTokenId,
      paymentToken: Common.Addresses.Weth[chainId],
      price,
      amount: totalAmount,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = buyOrder.buildMatching({ amount: amountFilled });

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceBefore).to.eq(10);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, matchParams);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceAfter).to.eq(6);
    expect(buyerNftBalanceAfter).to.eq(4);
    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.eq(
      price.mul(amountFilled).div(totalAmount)
    );
    expect(sellerWethBalanceAfter).to.eq(
      sellerWethBalanceBefore.add(price.mul(amountFilled).div(totalAmount))
    );
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

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange
    await weth.approve(buyer, SeaportV12.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV12.Addresses.Exchange[chainId]);

    const exchange = new SeaportV12.Exchange(chainId);

    const builder = new SeaportV12.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      side: "buy",
      tokenKind: "erc1155",
      offerer: buyer.address,
      contract: erc1155.address,
      tokenId: boughtTokenId,
      paymentToken: Common.Addresses.Weth[chainId],
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
    });

    // Sign the order
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = buyOrder.buildMatching();

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const feeRecipient1WethBalanceBefore = await weth.getBalance(
      feeRecipient1.address
    );
    const feeRecipient2WethBalanceBefore = await weth.getBalance(
      feeRecipient2.address
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      boughtTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      boughtTokenId
    );

    expect(sellerNftBalanceBefore).to.eq(1);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, matchParams);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const feeRecipient1WethBalanceAfter = await weth.getBalance(
      feeRecipient1.address
    );
    const feeRecipient2WethBalanceAfter = await weth.getBalance(
      feeRecipient2.address
    );
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      boughtTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      boughtTokenId
    );

    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(1);
    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.eq(price);
    expect(sellerWethBalanceAfter).to.eq(
      sellerWethBalanceBefore.add(price).sub(buyOrder.getFeeAmount())
    );
    expect(
      feeRecipient1WethBalanceAfter.sub(feeRecipient1WethBalanceBefore)
    ).to.eq(fee1);
    expect(
      feeRecipient2WethBalanceAfter.sub(feeRecipient2WethBalanceBefore)
    ).to.eq(fee2);
  });

  it("Build and fill buy order with partial filling and fees", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const fee = parseEther("0.2");
    const feeRecipient = ted;
    const soldTokenId = 10;
    const totalAmount = 10;
    const amountFilled = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange
    await weth.approve(buyer, SeaportV12.Addresses.Exchange[chainId]);

    // TODO: Look into filling the order so that this approval is not needed
    await weth.approve(seller, SeaportV12.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, totalAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, SeaportV12.Addresses.Exchange[chainId]);

    const exchange = new SeaportV12.Exchange(chainId);

    const builder = new SeaportV12.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      side: "buy",
      tokenKind: "erc1155",
      offerer: buyer.address,
      contract: erc1155.address,
      tokenId: soldTokenId,
      paymentToken: Common.Addresses.Weth[chainId],
      price,
      fees: [
        {
          amount: fee,
          recipient: feeRecipient.address,
        },
      ],
      amount: totalAmount,
      counter: 0,
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    // Create matching params
    const matchParams = buyOrder.buildMatching({ amount: amountFilled });

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const sellerWethBalanceBefore = await weth.getBalance(seller.address);
    const feeRecipientWethBalanceBefore = await weth.getBalance(ted.address);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceBefore).to.eq(10);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, matchParams);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const sellerWethBalanceAfter = await weth.getBalance(seller.address);
    const feeRecipientWethBalanceAfter = await weth.getBalance(ted.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerNftBalanceAfter).to.eq(6);
    expect(buyerNftBalanceAfter).to.eq(4);
    expect(buyerWethBalanceBefore.sub(buyerWethBalanceAfter)).to.eq(
      price.mul(amountFilled).div(totalAmount)
    );
    expect(sellerWethBalanceAfter).to.eq(
      sellerWethBalanceBefore.add(
        price.sub(fee).mul(amountFilled).div(totalAmount)
      )
    );
    expect(
      feeRecipientWethBalanceAfter.sub(feeRecipientWethBalanceBefore)
    ).to.eq(fee.mul(amountFilled).div(totalAmount));
  });
});
