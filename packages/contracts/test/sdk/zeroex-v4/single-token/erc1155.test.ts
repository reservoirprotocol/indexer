import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as ZeroexV4 from "@reservoir0x/sdk/src/zeroex-v4";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
} from "../../../utils";

describe("ZeroEx V4 - SingleToken Erc1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let ted: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, ted] = await ethers.getSigners();

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
    await weth.approve(buyer, ZeroexV4.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    const exchange = new ZeroexV4.Exchange(chainId);

    const builder = new ZeroexV4.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      direction: "buy",
      maker: buyer.address,
      contract: erc1155.address,
      tokenId: boughtTokenId,
      amount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      price,
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await buyOrder.sign(buyer);

    // Create matching sell order
    const sellOrder = buyOrder.buildMatching({ amount: 1 });

    await buyOrder.checkFillability(ethers.provider);

    const buyerWethBalanceBefore = await weth.getBalance(buyer.address);
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      boughtTokenId
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      boughtTokenId
    );

    expect(buyerWethBalanceBefore).to.eq(price);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(1);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, sellOrder);

    const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      boughtTokenId
    );
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      boughtTokenId
    );

    expect(buyerWethBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(1);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Build and fill buy order with partial fill and fees", async () => {
    const buyer = alice;
    const seller1 = bob;
    const seller2 = carol;
    const price = parseEther("1.8");
    const boughtTokenId = 0;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price.add(parseEther("0.3")));

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, ZeroexV4.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller1).mint(boughtTokenId);
    await erc1155.connect(seller1).mint(boughtTokenId);
    await erc1155.connect(seller2).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    const exchange = new ZeroexV4.Exchange(chainId);

    const builder = new ZeroexV4.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      direction: "buy",
      maker: buyer.address,
      contract: erc1155.address,
      tokenId: boughtTokenId,
      amount: 3,
      paymentToken: Common.Addresses.Weth[chainId],
      price,
      fees: [
        {
          recipient: ted.address,
          amount: parseEther("0.3"),
        },
      ],
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    // First fill
    {
      const seller = seller1;

      // Create matching sell order
      const sellOrder = buyOrder.buildMatching({ amount: 2 });

      const buyerNftBalanceBefore = await nft.getBalance(
        buyer.address,
        boughtTokenId
      );
      const sellerNftBalanceBefore = await nft.getBalance(
        seller.address,
        boughtTokenId
      );

      expect(buyerNftBalanceBefore).to.eq(0);
      expect(sellerNftBalanceBefore).to.eq(2);

      // Match orders
      await exchange.fillOrder(seller, buyOrder, sellOrder);

      const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
      const tedWethBalanceAfter = await weth.getBalance(ted.address);
      const buyerNftBalanceAfter = await nft.getBalance(
        buyer.address,
        boughtTokenId
      );
      const sellerNftBalanceAfter = await nft.getBalance(
        seller.address,
        boughtTokenId
      );

      expect(buyerWethBalanceAfter).to.eq(
        price.add(
          parseEther("0.3")
            .sub(price.mul(2).div(3))
            .sub(parseEther("0.3").mul(2).div(3))
        )
      );
      expect(tedWethBalanceAfter).to.eq(parseEther("0.3").mul(2).div(3));
      expect(buyerNftBalanceAfter).to.eq(2);
      expect(sellerNftBalanceAfter).to.eq(0);
    }

    // Second fill
    {
      const seller = seller2;

      // Create matching sell order
      const sellOrder = buyOrder.buildMatching({ amount: 1 });

      const buyerNftBalanceBefore = await nft.getBalance(
        buyer.address,
        boughtTokenId
      );
      const sellerNftBalanceBefore = await nft.getBalance(
        seller.address,
        boughtTokenId
      );

      expect(buyerNftBalanceBefore).to.eq(2);
      expect(sellerNftBalanceBefore).to.eq(1);

      // Match orders
      await exchange.fillOrder(seller, buyOrder, sellOrder);

      const buyerWethBalanceAfter = await weth.getBalance(buyer.address);
      const tedWethBalanceAfter = await weth.getBalance(ted.address);
      const buyerNftBalanceAfter = await nft.getBalance(
        buyer.address,
        boughtTokenId
      );
      const sellerNftBalanceAfter = await nft.getBalance(
        seller.address,
        boughtTokenId
      );

      expect(buyerWethBalanceAfter).to.eq(0);
      expect(tedWethBalanceAfter).to.eq(parseEther("0.3"));
      expect(buyerNftBalanceAfter).to.eq(3);
      expect(sellerNftBalanceAfter).to.eq(0);
    }
  });

  it("Build and fill sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, ZeroexV4.Addresses.Exchange[chainId]);

    const exchange = new ZeroexV4.Exchange(chainId);

    const builder = new ZeroexV4.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc1155.address,
      tokenId: soldTokenId,
      amount: 1,
      paymentToken: ZeroexV4.Addresses.Eth[chainId],
      price,
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await sellOrder.sign(seller);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching({ amount: 1 });

    await sellOrder.checkFillability(ethers.provider);

    const buyerEthBalanceBefore = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerEthBalanceBefore = await ethers.provider.getBalance(
      seller.address
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );

    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(1);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, buyOrder);

    const buyerEthBalanceAfter = await ethers.provider.getBalance(
      buyer.address
    );
    const sellerEthBalanceAfter = await ethers.provider.getBalance(
      seller.address
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );

    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(price);
    expect(sellerEthBalanceAfter).to.eq(sellerEthBalanceBefore.add(price));
    expect(buyerNftBalanceAfter).to.eq(1);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Build and fill sell order with partial fill", async () => {
    const buyer1 = alice;
    const buyer2 = carol;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(soldTokenId);
    await erc1155.connect(seller).mint(soldTokenId);
    await erc1155.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, ZeroexV4.Addresses.Exchange[chainId]);

    const exchange = new ZeroexV4.Exchange(chainId);

    const builder = new ZeroexV4.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      direction: "sell",
      maker: seller.address,
      contract: erc1155.address,
      tokenId: soldTokenId,
      amount: 3,
      paymentToken: ZeroexV4.Addresses.Eth[chainId],
      price,
      fees: [
        {
          recipient: ted.address,
          amount: parseEther("0.3"),
        },
      ],
      expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
    });

    // Sign the order
    await sellOrder.sign(seller);

    await sellOrder.checkFillability(ethers.provider);

    // First fill
    {
      const buyer = buyer1;

      // Create matching buy order
      const buyOrder = sellOrder.buildMatching({ amount: 2 });

      const buyerEthBalanceBefore = await ethers.provider.getBalance(
        buyer.address
      );
      const sellerEthBalanceBefore = await ethers.provider.getBalance(
        seller.address
      );
      const tedEthBalanceBefore = await ethers.provider.getBalance(ted.address);
      const buyerNftBalanceBefore = await nft.getBalance(
        buyer.address,
        soldTokenId
      );
      const sellerNftBalanceBefore = await nft.getBalance(
        seller.address,
        soldTokenId
      );

      expect(buyerNftBalanceBefore).to.eq(0);
      expect(sellerNftBalanceBefore).to.eq(3);

      // Match orders
      await exchange.fillOrder(buyer, sellOrder, buyOrder);

      const buyerEthBalanceAfter = await ethers.provider.getBalance(
        buyer.address
      );
      const sellerEthBalanceAfter = await ethers.provider.getBalance(
        seller.address
      );
      const tedEthBalanceAfter = await ethers.provider.getBalance(ted.address);
      const buyerNftBalanceAfter = await nft.getBalance(
        buyer.address,
        soldTokenId
      );
      const sellerNftBalanceAfter = await nft.getBalance(
        seller.address,
        soldTokenId
      );

      expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(
        price.mul(2).div(3)
      );
      expect(sellerEthBalanceAfter).to.be.gte(
        sellerEthBalanceBefore.add(price.mul(2).div(3))
      );
      expect(tedEthBalanceAfter.sub(tedEthBalanceBefore)).to.eq(
        parseEther("0.3").mul(2).div(3)
      );
      expect(buyerNftBalanceAfter).to.eq(2);
      expect(sellerNftBalanceAfter).to.eq(1);
    }

    // Second fill
    {
      const buyer = buyer2;

      // Create matching buy order
      const buyOrder = sellOrder.buildMatching({ amount: 1 });

      const buyerEthBalanceBefore = await ethers.provider.getBalance(
        buyer.address
      );
      const sellerEthBalanceBefore = await ethers.provider.getBalance(
        seller.address
      );
      const tedEthBalanceBefore = await ethers.provider.getBalance(ted.address);
      const buyerNftBalanceBefore = await nft.getBalance(
        buyer.address,
        soldTokenId
      );
      const sellerNftBalanceBefore = await nft.getBalance(
        seller.address,
        soldTokenId
      );

      expect(buyerNftBalanceBefore).to.eq(0);
      expect(sellerNftBalanceBefore).to.eq(1);

      // Match orders
      await exchange.fillOrder(buyer, sellOrder, buyOrder);

      const buyerEthBalanceAfter = await ethers.provider.getBalance(
        buyer.address
      );
      const sellerEthBalanceAfter = await ethers.provider.getBalance(
        seller.address
      );
      const tedEthBalanceAfter = await ethers.provider.getBalance(ted.address);
      const buyerNftBalanceAfter = await nft.getBalance(
        buyer.address,
        soldTokenId
      );
      const sellerNftBalanceAfter = await nft.getBalance(
        seller.address,
        soldTokenId
      );

      expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.be.gt(
        price.mul(1).div(3)
      );
      expect(sellerEthBalanceAfter).to.be.gte(
        sellerEthBalanceBefore.add(price.mul(1).div(3))
      );
      expect(tedEthBalanceAfter.sub(tedEthBalanceBefore)).to.eq(
        parseEther("0.1")
      );
      expect(buyerNftBalanceAfter).to.eq(1);
      expect(sellerNftBalanceAfter).to.eq(0);
    }
  });

  it("Batch buy", async () => {
    const buyer = alice;
    const soldTokenId = 0;

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    const sellOrders: ZeroexV4.Order[] = [];
    for (const seller of [bob, carol]) {
      // Mint erc1155 to seller
      await erc1155.connect(seller).mint(soldTokenId);
      await erc1155.connect(seller).mint(soldTokenId);

      // Approve the exchange
      await nft.approve(seller, ZeroexV4.Addresses.Exchange[chainId]);

      const builder = new ZeroexV4.Builders.SingleToken(chainId);

      // Build sell order
      const sellOrder = builder.build({
        direction: "sell",
        maker: seller.address,
        contract: erc1155.address,
        tokenId: soldTokenId,
        amount: 2,
        paymentToken: ZeroexV4.Addresses.Eth[chainId],
        price: parseEther("0.5"),
        fees: [
          {
            recipient: ted.address,
            amount: parseEther("0.07"),
          },
        ],
        expiry: (await getCurrentTimestamp(ethers.provider)) + 60,
      });

      // Sign the order
      await sellOrder.sign(seller);

      await sellOrder.checkFillability(ethers.provider);

      sellOrders.push(sellOrder);
    }

    const matchParams: ZeroexV4.Types.MatchParams[] = [];
    for (const sellOrder of sellOrders) {
      // Create matching buy order
      const buyOrder = sellOrder.buildMatching({ amount: 1 });

      matchParams.push(buyOrder);
    }

    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const bobNftBalanceBefore = await nft.getBalance(bob.address, soldTokenId);
    const carolNftBalanceBefore = await nft.getBalance(
      carol.address,
      soldTokenId
    );

    expect(buyerNftBalanceBefore).to.eq(0);
    expect(bobNftBalanceBefore).to.eq(2);
    expect(carolNftBalanceBefore).to.eq(2);

    const exchange = new ZeroexV4.Exchange(chainId);

    // Match orders
    await exchange.batchBuy(buyer, sellOrders, matchParams);

    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const bobNftBalanceAfter = await nft.getBalance(bob.address, soldTokenId);
    const carolNftBalanceAfter = await nft.getBalance(
      carol.address,
      soldTokenId
    );

    expect(buyerNftBalanceAfter).to.eq(2);
    expect(bobNftBalanceAfter).to.eq(1);
    expect(carolNftBalanceAfter).to.eq(1);
  });
});
