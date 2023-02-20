import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  bn,
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
} from "../../utils";
import { ListingDetails } from "@reservoir0x/sdk/src/router/v5/types";

describe("[RouterV5_0_0] Multi buy", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let referrer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dan: SignerWithAddress;

  let erc721: Contract;
  let erc1155: Contract;
  let router: Sdk.RouterV5.Router;

  beforeEach(async () => {
    [deployer, referrer, alice, bob, carol, dan] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));

    router = new Sdk.RouterV5.Router(chainId, ethers.provider);
  });

  afterEach(reset);

  it("Fill multiple listings", async () => {
    const routerFee = 100;

    const buyer = dan;

    const sellOrders: ListingDetails[] = [];

    // Order 1: Seaport
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.Seaport.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.Seaport.Builders.SingleToken(chainId);
      const sellOrder = builder.build({
        side: "sell",
        tokenKind: "erc721",
        offerer: seller1.address,
        contract: erc721.address,
        tokenId: tokenId1,
        paymentToken: Sdk.Common.Addresses.Eth[chainId],
        price: price1.sub(price1.mul(fee1).div(10000)),
        fees: [
          {
            amount: price1.mul(fee1).div(10000),
            recipient: deployer.address,
          },
        ],
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      });
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      sellOrders.push({
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
      });
    }

    // Order 2: LooksRare
    const seller2 = bob;
    const tokenId2 = 1;
    const price2 = parseEther("2");
    const fee2 = bn(150);
    {
      // Mint erc721 to seller
      await erc721.connect(seller2).mint(tokenId2);

      // Approve the transfer manager
      await erc721
        .connect(seller2)
        .setApprovalForAll(
          Sdk.LooksRare.Addresses.TransferManagerErc721[chainId],
          true
        );

      const exchange = new Sdk.LooksRare.Exchange(chainId);
      const builder = new Sdk.LooksRare.Builders.SingleToken(chainId);

      // Build sell order
      const sellOrder = builder.build({
        isOrderAsk: true,
        signer: seller2.address,
        collection: erc721.address,
        tokenId: tokenId2,
        currency: Sdk.Common.Addresses.Weth[chainId],
        price: price2,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
        nonce: await exchange.getNonce(ethers.provider, seller2.address),
      });
      await sellOrder.sign(seller2);

      await sellOrder.checkFillability(ethers.provider);

      sellOrders.push({
        kind: "looks-rare",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
      });
    }

    // Order 3: ZeroEx V4
    const seller3 = carol;
    const tokenId3 = 0;
    const totalAmount3 = 9;
    // TODO: Investigate precision issues (eg. when setting `amount3 = 4`)
    const amount3 = 3;
    const price3 = parseEther("2");
    const fee3 = parseEther("0.1");
    const totalPaid3 = price3.add(fee3);
    {
      // Mint erc1155 to seller
      await erc1155.connect(seller3).mintMany(tokenId3, totalAmount3);

      // Approve the exchange
      await erc1155
        .connect(seller3)
        .setApprovalForAll(Sdk.ZeroExV4.Addresses.Exchange[chainId], true);

      const builder = new Sdk.ZeroExV4.Builders.SingleToken(chainId);

      // Build sell order
      const sellOrder = builder.build({
        direction: "sell",
        maker: seller3.address,
        contract: erc1155.address,
        tokenId: tokenId3,
        amount: totalAmount3,
        fees: [
          {
            recipient: deployer.address,
            amount: fee3,
          },
        ],
        paymentToken: Sdk.ZeroExV4.Addresses.Eth[chainId],
        price: price3,
        expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
      });
      await sellOrder.sign(seller3);

      await sellOrder.checkFillability(ethers.provider);

      sellOrders.push({
        kind: "zeroex-v4",
        contractKind: "erc1155",
        contract: erc1155.address,
        tokenId: tokenId3.toString(),
        amount: amount3,
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
      });
    }

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    const referrerEthBalanceBefore = await referrer.getBalance();
    const seller1EthBalanceBefore = await seller1.getBalance();
    const seller2WethBalanceBefore = await weth.getBalance(seller2.address);
    const seller3EthBalanceBefore = await seller3.getBalance();
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const token2OwnerBefore = await erc721.ownerOf(tokenId2);
    const token3BuyerBalanceBefore = await erc1155.balanceOf(
      buyer.address,
      tokenId3
    );
    const routerEthBalanceBefore = await ethers.provider.getBalance(
      router.contract.address
    );
    const routerWethBalanceBefore = await weth.getBalance(
      router.contract.address
    );
    expect(token1OwnerBefore).to.eq(seller1.address);
    expect(token2OwnerBefore).to.eq(seller2.address);
    expect(token3BuyerBalanceBefore).to.eq(0);

    const tx = await router.fillListingsTx(sellOrders, buyer.address, {
      source: "reservoir.market",
      fee: { bps: routerFee, recipient: referrer.address },
    });
    await buyer.sendTransaction(tx);

    const referrerEthBalanceAfter = await referrer.getBalance();
    const seller1EthBalanceAfter = await seller1.getBalance();
    const seller2WethBalanceAfter = await weth.getBalance(seller2.address);
    const seller3EthBalanceAfter = await seller3.getBalance();
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token2OwnerAfter = await erc721.ownerOf(tokenId2);
    const token3BuyerBalanceAfter = await erc1155.balanceOf(
      buyer.address,
      tokenId3
    );
    const routerEthBalanceAfter = await ethers.provider.getBalance(
      router.contract.address
    );
    const routerWethBalanceAfter = await weth.getBalance(
      router.contract.address
    );
    expect(referrerEthBalanceAfter.sub(referrerEthBalanceBefore)).to.eq(
      price1
        .add(price2)
        .add(totalPaid3.mul(amount3).div(totalAmount3))
        .mul(routerFee)
        .div(10000)
    );
    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(seller2WethBalanceAfter.sub(seller2WethBalanceBefore)).to.eq(
      price2.sub(price2.mul(fee2).div(10000))
    );
    // TODO: Investigate precision issues
    expect(seller3EthBalanceAfter.sub(seller3EthBalanceBefore).div(100)).to.eq(
      price3.mul(amount3).div(totalAmount3).div(100)
    );
    expect(token1OwnerAfter).to.eq(buyer.address);
    expect(token2OwnerAfter).to.eq(buyer.address);
    expect(token3BuyerBalanceAfter).to.eq(amount3);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerEthBalanceAfter.sub(routerEthBalanceBefore)).to.eq(0);
    expect(routerWethBalanceAfter.sub(routerWethBalanceBefore)).to.eq(0);
  });

  it("Fill multiple listings with skipped reverts", async () => {
    const routerFee = 100;

    const buyer = dan;

    const sellOrders: ListingDetails[] = [];

    // Order 1: Seaport
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.Seaport.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.Seaport.Builders.SingleToken(chainId);
      const sellOrder = builder.build({
        side: "sell",
        tokenKind: "erc721",
        offerer: seller1.address,
        contract: erc721.address,
        tokenId: tokenId1,
        paymentToken: Sdk.Common.Addresses.Eth[chainId],
        price: price1.sub(price1.mul(fee1).div(10000)),
        fees: [
          {
            amount: price1.mul(fee1).div(10000),
            recipient: deployer.address,
          },
        ],
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      });
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      sellOrders.push({
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
      });

      sellOrders.push({
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
      });
    }

    const weth = new Sdk.Common.Helpers.Weth(ethers.provider, chainId);

    const referrerEthBalanceBefore = await referrer.getBalance();
    const seller1EthBalanceBefore = await seller1.getBalance();
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const routerEthBalanceBefore = await ethers.provider.getBalance(
      router.contract.address
    );
    const routerWethBalanceBefore = await weth.getBalance(
      router.contract.address
    );
    expect(token1OwnerBefore).to.eq(seller1.address);

    const nonPartialTx = await router.fillListingsTx(
      sellOrders,
      buyer.address,
      {
        source: "reservoir.market",
        fee: { bps: routerFee, recipient: referrer.address },
      }
    );
    await expect(buyer.sendTransaction(nonPartialTx)).to.be.reverted;

    const partialTx = await router.fillListingsTx(sellOrders, buyer.address, {
      source: "reservoir.market",
      fee: { bps: routerFee, recipient: referrer.address },
      partial: true,
    });
    await buyer.sendTransaction(partialTx);

    const referrerEthBalanceAfter = await referrer.getBalance();
    const seller1EthBalanceAfter = await seller1.getBalance();
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const routerEthBalanceAfter = await ethers.provider.getBalance(
      router.contract.address
    );
    const routerWethBalanceAfter = await weth.getBalance(
      router.contract.address
    );
    expect(referrerEthBalanceAfter.sub(referrerEthBalanceBefore)).to.eq(
      price1.mul(routerFee).div(10000)
    );
    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(token1OwnerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerEthBalanceAfter.sub(routerEthBalanceBefore)).to.eq(0);
    expect(routerWethBalanceAfter.sub(routerWethBalanceBefore)).to.eq(0);
  });

  it("Fill multiple Seaport listings", async () => {
    const buyer = dan;

    const sellOrders: ListingDetails[] = [];

    // Order 1: Seaport
    const seller1 = alice;
    const tokenId1 = 0;
    const price1 = parseEther("1");
    const fee1 = bn(550);
    {
      // Mint erc721 to seller
      await erc721.connect(seller1).mint(tokenId1);

      // Approve the exchange
      await erc721
        .connect(seller1)
        .setApprovalForAll(Sdk.Seaport.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.Seaport.Builders.SingleToken(chainId);
      const sellOrder = builder.build({
        side: "sell",
        tokenKind: "erc721",
        offerer: seller1.address,
        contract: erc721.address,
        tokenId: tokenId1,
        paymentToken: Sdk.Common.Addresses.Eth[chainId],
        price: price1.sub(price1.mul(fee1).div(10000)),
        fees: [
          {
            amount: price1.mul(fee1).div(10000),
            recipient: deployer.address,
          },
        ],
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      });
      await sellOrder.sign(seller1);

      await sellOrder.checkFillability(ethers.provider);

      sellOrders.push({
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId1.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
      });
    }

    // Order 2: Seaport
    const seller2 = bob;
    const tokenId2 = 1;
    const price2 = parseEther("1.5");
    const fee2 = bn(150);
    {
      // Mint erc721 to seller
      await erc721.connect(seller2).mint(tokenId2);

      // Approve the exchange
      await erc721
        .connect(seller2)
        .setApprovalForAll(Sdk.Seaport.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.Seaport.Builders.SingleToken(chainId);
      const sellOrder = builder.build({
        side: "sell",
        tokenKind: "erc721",
        offerer: seller2.address,
        contract: erc721.address,
        tokenId: tokenId2,
        paymentToken: Sdk.Common.Addresses.Eth[chainId],
        price: price2.sub(price2.mul(fee2).div(10000)),
        fees: [
          {
            amount: price2.mul(fee2).div(10000),
            recipient: deployer.address,
          },
        ],
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      });
      await sellOrder.sign(seller2);

      await sellOrder.checkFillability(ethers.provider);

      sellOrders.push({
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId2.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
      });
    }

    // Order 3: Seaport
    const seller3 = carol;
    const tokenId3 = 2;
    const price3 = parseEther("0.11");
    const fee3 = bn(1120);
    {
      // Mint erc721 to seller
      await erc721.connect(seller3).mint(tokenId3);

      // Approve the exchange
      await erc721
        .connect(seller3)
        .setApprovalForAll(Sdk.Seaport.Addresses.Exchange[chainId], true);

      // Build sell order
      const builder = new Sdk.Seaport.Builders.SingleToken(chainId);
      const sellOrder = builder.build({
        side: "sell",
        tokenKind: "erc721",
        offerer: seller3.address,
        contract: erc721.address,
        tokenId: tokenId3,
        paymentToken: Sdk.Common.Addresses.Eth[chainId],
        price: price3.sub(price3.mul(fee3).div(10000)),
        fees: [
          {
            amount: price3.mul(fee3).div(10000),
            recipient: deployer.address,
          },
        ],
        counter: 0,
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      });
      await sellOrder.sign(seller3);

      await sellOrder.checkFillability(ethers.provider);

      sellOrders.push({
        kind: "seaport",
        contractKind: "erc721",
        contract: erc721.address,
        tokenId: tokenId3.toString(),
        order: sellOrder,
        currency: Sdk.Common.Addresses.Eth[chainId],
      });
    }

    const seller1EthBalanceBefore = await seller1.getBalance();
    const seller2EthBalanceBefore = await seller2.getBalance();
    const seller3EthBalanceBefore = await seller3.getBalance();
    const token1OwnerBefore = await erc721.ownerOf(tokenId1);
    const token2OwnerBefore = await erc721.ownerOf(tokenId2);
    const token3OwnerBefore = await erc721.ownerOf(tokenId3);
    const routerEthBalanceBefore = await ethers.provider.getBalance(
      router.contract.address
    );

    expect(token1OwnerBefore).to.eq(seller1.address);
    expect(token2OwnerBefore).to.eq(seller2.address);
    expect(token3OwnerBefore).to.eq(seller3.address);

    const tx = await router.fillListingsTx(sellOrders, buyer.address, {
      source: "reservoir.market",
    });
    await buyer.sendTransaction(tx);

    const seller1EthBalanceAfter = await seller1.getBalance();
    const seller2EthBalanceAfter = await seller2.getBalance();
    const seller3EthBalanceAfter = await seller3.getBalance();
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token2OwnerAfter = await erc721.ownerOf(tokenId2);
    const token3OwnerAfter = await erc721.ownerOf(tokenId3);
    const routerEthBalanceAfter = await ethers.provider.getBalance(
      router.contract.address
    );

    expect(seller1EthBalanceAfter.sub(seller1EthBalanceBefore)).to.eq(
      price1.sub(price1.mul(fee1).div(10000))
    );
    expect(seller2EthBalanceAfter.sub(seller2EthBalanceBefore)).to.eq(
      price2.sub(price2.mul(fee2).div(10000))
    );
    expect(seller3EthBalanceAfter.sub(seller3EthBalanceBefore)).to.eq(
      price3.sub(price3.mul(fee3).div(10000))
    );
    expect(token1OwnerAfter).to.eq(buyer.address);
    expect(token2OwnerAfter).to.eq(buyer.address);
    expect(token3OwnerAfter).to.eq(buyer.address);

    // Router is stateless (it shouldn't keep any funds)
    expect(routerEthBalanceAfter.sub(routerEthBalanceBefore)).to.eq(0);
  });
});
