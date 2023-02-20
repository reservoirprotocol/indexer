import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Rarible from "@reservoir0x/sdk/src/rarible";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, reset, setupNFTs } from "../../../../utils";
import { BigNumber, constants } from "ethers";

describe("Rarible - SingleToken Bids Erc1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let charlie: SignerWithAddress;
  let dan: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, charlie, dan] = await ethers.getSigners();

    ({ erc1155 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Rarible V1 Order data - 1 payout and 2 origin fees - Build and fill ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [{ account: buyer.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: "150" },
        { account: dan.address, value: "100" },
      ],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Rarible V1 Order data - 1 payout and 2 origin fees - Build and partial fill ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [{ account: buyer.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: "150" },
        { account: dan.address, value: "100" },
      ],
    });

    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Rarible V1 Order data - 2 payouts and 0 origin fees - Build and fill ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [
        { account: buyer.address, value: "9000" },
        { account: dan.address, value: "1000" },
      ],
      originFees: [
        // { account: charlie.address, value: "150"},
        // { account: dan.address, value: "100"},
      ],
    });
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Rarible V1 Order data - 2 payouts and 0 origin fees - Build and partial ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [
        { account: buyer.address, value: "9000" },
        { account: dan.address, value: "1000" },
      ],
      originFees: [
        // { account: charlie.address, value: "150"},
        // { account: dan.address, value: "100"},
      ],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Rarible V2 Order data - 1 payout and 0 origin fees - Build and fill ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [{ account: buyer.address, value: "10000" }],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Rarible V2 Order data - 1 payout and 2 origin fees - Build and fill ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const nftPrice = parseEther("0.2");
    const priceSent = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "200";

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, priceSent);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: nftPrice.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [{ account: buyer.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(priceSent);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    let priceWithFees = nftPrice;
    priceWithFees = priceWithFees.add(
      priceWithFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(priceSent.sub(priceWithFees));
    expect(buyerBalanceAfter).to.eq(nftPrice);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Rarible V2 Order data - 2 origin fees - Build and partial ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const nftPrice = parseEther("0.2");
    const priceSent = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "200";

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, priceSent);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: nftPrice.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [{ account: buyer.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(priceSent);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const filledPrice = nftPrice.div(mintTokensAmount).mul(fillAmount);
    let priceWithFees = filledPrice;
    priceWithFees = priceWithFees.add(
      priceWithFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(priceSent.sub(priceWithFees));
    expect(buyerBalanceAfter).to.eq(filledPrice);
    expect(buyerNftBalanceAfter).to.eq(fillAmount);
    expect(sellerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
  });

  it("Rarible V2 Order data - 0 origin fees - Build and partial ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [{ account: buyer.address, value: "10000" }],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Rarible V3 Order data - 0 origin fees Build and fill ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_BUY,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      payouts: [],
      startTime: 0,
      endTime: 0,
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(price);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Rarible V3 Order data - 0 origin fees Build and partial fill ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_BUY,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const filledPrice = price.div(mintTokensAmount).mul(fillAmount);

    expect(sellerBalanceAfter).to.be.eq(price.sub(filledPrice));
    expect(buyerBalanceAfter).to.eq(filledPrice);
    expect(buyerNftBalanceAfter).to.eq(fillAmount);
    expect(sellerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
  });

  it("Rarible V3 Order data - 1 origin fee Build and fill ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const revenueSplitBpsA = "300";

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_BUY,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      payouts: [],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA)).div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(priceAfterFees);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Rarible V3 Order data - 1 origin fee Build and partial ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const revenueSplitBpsA = "300";
    const fillAmount = 2;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_BUY,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      payouts: [],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    let filledPrice = price.div(mintTokensAmount).mul(fillAmount);

    let priceAfterFees = filledPrice;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA)).div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(sellerBalanceBefore.sub(filledPrice));
    expect(buyerBalanceAfter).to.eq(priceAfterFees);
    expect(buyerNftBalanceAfter).to.eq(fillAmount);
    expect(sellerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
  });

  it("Rarible V3 Order data - 2 origin fees Build and fill ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_BUY,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [],
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      originFeeSecond: { account: dan.address, value: revenueSplitBpsB },
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(0);
    expect(buyerBalanceAfter).to.eq(priceAfterFees);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
    expect(sellerNftBalanceAfter).to.eq(0);
  });

  it("Rarible V3 Order data - 2 origin fees Build and partial ERC1155 WETH buy order", async () => {
    const seller = alice;
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";
    const fillAmount = 2;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(seller.address);
    const sellerBalanceBefore = await weth.getBalance(buyer.address);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build buy order
    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_BUY,
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      originFeeSecond: { account: dan.address, value: revenueSplitBpsB },
      payouts: [],
    });

    // Sign the order
    await buyOrder.checkValidity();
    await buyOrder.sign(buyer);
    await buyOrder.checkFillability(ethers.provider);
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(price);
    expect(buyerBalanceBefore).to.eq(0);
    expect(buyerNftBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(seller.address);
    const sellerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    let filledPrice = price.div(mintTokensAmount).mul(fillAmount);
    let priceAfterFees = filledPrice;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(sellerBalanceAfter).to.be.eq(sellerBalanceBefore.sub(filledPrice));
    expect(buyerBalanceAfter).to.eq(priceAfterFees);
    expect(buyerNftBalanceAfter).to.eq(fillAmount);
    expect(sellerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
  });
});
