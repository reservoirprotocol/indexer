import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Rarible from "@reservoir0x/sdk/src/rarible";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, reset, setupNFTs } from "../../../../utils";
import { BigNumber, constants } from "ethers";

describe("Rarible - SingleToken Listings Erc1155", () => {
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

  it("Rarible V1 Order data - 1 payout and 2 origin fees - Build and fill ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: "100" },
        { account: dan.address, value: "150" },
      ],
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });
  it("Rarible V1 Order data - 1 payout and 2 origin fees - Build and partial fill ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: "100" },
        { account: dan.address, value: "150" },
      ],
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });
  it("Rarible V1 Order data - 2 payouts and 0 origin fees - Build and fill ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [
        { account: seller.address, value: "9000" },
        { account: charlie.address, value: "1000" },
      ],
      originFees: [
        // { account: charlie.address, value: "100"},
        // { account: dan.address, value: "150"},
      ],
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });
  it("Rarible V1 Order data - 2 payouts and 0 origin fees - Build and partial ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        // { account: charlie.address, value: "100"},
        // { account: dan.address, value: "150"},
      ],
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });

  it("Rarible V2 Order data - 1 payout and 2 origin fees - Build and fill ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });

  it("Rarible V2 Order data - 1 payout and 2 origin fees - Build and partial ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const revenueSplitBpsA = "200";
    const revenueSplitBpsB = "300";
    const fillAmount = 2;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);
    let fillPrice = price.div(mintTokensAmount).mul(fillAmount);

    let priceAfterFees = price.div(mintTokensAmount).mul(fillAmount);
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(fillPrice)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(sellerNftBalanceAfter).eq(mintTokensAmount - fillAmount);
    expect(buyerNftBalanceAfter).eq(fillAmount.toString());
  });

  it("Rarible V2 Order data - 2 payouts and 2 origin fees - Build and fill ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const sellerPayoutBps = "9000";
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [
        { account: seller.address, value: sellerPayoutBps },
        { account: dan.address, value: "1000" },
      ],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);
    const sellerPayoutPrice = price.mul(sellerPayoutBps).div("10000");
    let priceAfterFees = sellerPayoutPrice;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });

  it("Rarible V2 Order data - 2 payouts and 2 origin fees - Build and partial ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";
    const sellerPayoutBps = "9000";
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [
        { account: seller.address, value: sellerPayoutBps },
        { account: dan.address, value: "1000" },
      ],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);
    const fillPrice = price.div(mintTokensAmount).mul(fillAmount);

    const sellerPayoutPrice = price
      .div(mintTokensAmount)
      .mul(fillAmount)
      .mul(sellerPayoutBps)
      .div("10000");

    let priceAfterFees = sellerPayoutPrice;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );
    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(fillPrice)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));

    expect(sellerNftBalanceAfter).eq(mintTokensAmount - fillAmount);
    expect(buyerNftBalanceAfter).eq(fillAmount);
  });

  it("Rarible V2 Order data - 1 payout and 0 origin fees - Build and fill ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [],
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });

  it("Rarible V2 Order data - 1 payout and 0 origin fees - Build and partial ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [],
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });

  it("Rarible V3 Order data - 0 origin fee Build and fill ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      payouts: [],
      originFeeFirst: { account: charlie.address, value: "150" },
      originFeeSecond: { account: dan.address, value: "100" },
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });

  it("Rarible V3 Order data - 0 origin fee Build and partial fill ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      payouts: [],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    const filledPrice = price.div(mintTokensAmount).mul(fillAmount);

    expect(buyerBalanceAfter).to.be.eq(price.sub(filledPrice));

    expect(sellerBalanceAfter).to.eq(filledPrice);

    expect(sellerNftBalanceAfter).to.eq(fillAmount);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
  });

  it("Rarible V3 Order data - 0 origin fee Build and fill ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      payouts: [],
      startTime: 0,
      endTime: 0,
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(price));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });

  it("Rarible V3 Order data - 0 origin fee Build and partial fill ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      payouts: [],
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    const filledPrice = price.div(mintTokensAmount).mul(fillAmount);
    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(filledPrice)
    );

    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(filledPrice));
    expect(sellerNftBalanceAfter).eq(mintTokensAmount - fillAmount);
    expect(buyerNftBalanceAfter).eq(fillAmount);
  });

  it("Rarible V3 Order data - 1 origin fee Build and fill ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const revenueSplitBpsA = "150";
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      payouts: [],
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA)).div(10000)
    );
    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount.toString());
  });

  it("Rarible V3 Order data - 1 origin fee Build and partial ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;
    const revenueSplitBpsA = "150";

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      // originFeeSecond: { account: dan.address, value: '100' },
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      payouts: [],
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    let fillPrice = price.div(mintTokensAmount).mul(fillAmount);
    let priceAfterFees = price.div(mintTokensAmount).mul(fillAmount);
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA)).div(10000)
    );
    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(fillPrice)
    );

    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(sellerNftBalanceAfter).eq(mintTokensAmount - fillAmount);
    expect(buyerNftBalanceAfter).eq(fillAmount.toString());
  });

  it("Rarible V3 Order data - 2 origin fees Build and fill ERC1155 ETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);
    const revenueSplitBpsA = "200";
    const revenueSplitBpsB = "500";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [],
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      originFeeSecond: { account: dan.address, value: revenueSplitBpsB },
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
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

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(priceAfterFees);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });

  it("Rarible V3 Order Data - 2 origin fees Build and fill ERC1155 ETH sell order with revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const revenueSplitBpsA = "200";
    const revenueSplitBpsB = "300";

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      price: price.toString(),
      startTime: 0,
      endTime: 0,
      payouts: [],
      originFeeFirst: {
        account: charlie.address,
        value: revenueSplitBpsA,
      },
      originFeeSecond: {
        account: dan.address,
        value: revenueSplitBpsB,
      },
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);

    let priceAfterFees = price;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(price)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(sellerNftBalanceAfter).eq(0);
    expect(buyerNftBalanceAfter).eq(mintTokensAmount);
  });

  it("Rarible V3 Order data - 2 origin fees Build and partial ERC1155 ETH sell order with revenue splits", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;
    const revenueSplitBpsA = "200";
    const revenueSplitBpsB = "500";

    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      originFeeSecond: { account: dan.address, value: revenueSplitBpsB },
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      payouts: [],
    });
    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const buyerBalanceBefore = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
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

    expect(sellerNftBalanceBefore).eq(mintTokensAmount.toString());
    expect(buyerNftBalanceBefore).eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
      assetClass: "ERC1155",
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await ethers.provider.getBalance(buyer.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const gasUsed = txReceipt.gasUsed.mul(txReceipt.effectiveGasPrice);
    const fillPrice = price.div(mintTokensAmount).mul(fillAmount);
    let priceAfterFees = price.div(mintTokensAmount).mul(fillAmount);
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );
    expect(buyerBalanceAfter).to.be.eq(
      buyerBalanceBefore.sub(gasUsed).sub(fillPrice)
    );
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(sellerNftBalanceAfter).eq(mintTokensAmount - fillAmount);
    expect(buyerNftBalanceAfter).eq(fillAmount).toString();
  });

  //weth
  it("Rarible V1 Order data - 1 payout and 2 origin fees - Build and fill ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: "150" },
        { account: dan.address, value: "200" },
      ],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });
  it("Rarible V1 Order data - 1 payout and 2 origin fees - Build and partial fill ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: "150" },
        { account: dan.address, value: "200" },
      ],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: mintTokensAmount - 1,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });
  it("Rarible V1 Order data - 2 payouts and 0 origin fees - Build and fill ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [
        { account: seller.address, value: "9600" },
        { account: dan.address, value: "400" },
      ],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });
  it("Rarible V1 Order data - 2 payouts and 0 origin fees - Build and partial ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V1,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [
        { account: seller.address, value: "9600" },
        { account: dan.address, value: "400" },
      ],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: mintTokensAmount - 1,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });

  it("Rarible V2 Order data - 1 payout and 2 origin fees - Build and fill ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
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

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    const tx = await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const txReceipt = await tx.wait();

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
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

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(priceAfterFees));
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });

  it("Rarible V2 Order data - 1 payout and 2 origin fees - Build and partial ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    let fillPrice = price.div(mintTokensAmount).mul(fillAmount);
    let priceAfterFees = price.div(mintTokensAmount).mul(fillAmount);
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(fillPrice));
    expect(sellerBalanceAfter).to.be.eq(priceAfterFees);
    expect(sellerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
    expect(buyerNftBalanceAfter).to.eq(fillAmount);
  });

  it("Rarible V2 Order data - 2 payouts and 2 origin fees - Build and fill ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";
    const sellerPayoutBps = "9000";

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [
        { account: seller.address, value: sellerPayoutBps },
        { account: dan.address, value: "1000" },
      ],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    let priceAfterFees = price.mul(sellerPayoutBps).div("10000");
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.be.eq(
      sellerBalanceBefore.add(priceAfterFees)
    );
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });

  it("Rarible V2 Order data - 2 payouts and 2 origin fees - Build and partial ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;
    const revenueSplitBpsA = "300";
    const revenueSplitBpsB = "400";
    const sellerPayoutBps = "9000";

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [
        { account: seller.address, value: sellerPayoutBps },
        { account: dan.address, value: "1000" },
      ],
      originFees: [
        { account: charlie.address, value: revenueSplitBpsA },
        { account: dan.address, value: revenueSplitBpsB },
      ],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    const fillPrice = price.div(mintTokensAmount).mul(fillAmount);

    const sellerPayoutPrice = price
      .div(mintTokensAmount)
      .mul(fillAmount)
      .mul(sellerPayoutBps)
      .div("10000");

    let priceAfterFees = sellerPayoutPrice;
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees
        .mul(BigNumber.from(revenueSplitBpsA).add(revenueSplitBpsB))
        .div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(fillPrice));
    expect(sellerBalanceAfter).to.be.eq(
      sellerBalanceBefore.add(priceAfterFees)
    );
    expect(sellerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
    expect(buyerNftBalanceAfter).to.eq(fillAmount);
  });

  it("Rarible V2 Order data - 1 payout and 0 origin fees - Build and fill ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceAfter).to.be.eq(sellerBalanceBefore.add(price));
    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });

  it("Rarible V2 Order data - 1 payout and 0 origin fees - Build and partial ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const fillPrice = price.div(mintTokensAmount).mul(fillAmount);
    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(fillPrice));
    expect(sellerBalanceAfter).to.eq(sellerBalanceBefore.add(fillPrice));
    expect(buyerNftBalanceAfter).to.eq(fillAmount);
    expect(sellerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
  });

  it("Rarible V3 Order data - 1 origin fee Build and fill ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      payouts: [],
      originFeeFirst: { account: charlie.address, value: "150" },
      // originFeeSecond: { account: dan.address, value: '100' },
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      isMakeFill: true,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });

  it("Rarible V3 Order data - 1 origin fee Build and partial ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;
    const revenueSplitBpsA = "150";
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      payouts: [],
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    const priceAfterFill = price.div(mintTokensAmount).mul(fillAmount);
    let priceAfterFees = price.div(mintTokensAmount).mul(fillAmount);
    priceAfterFees = priceAfterFees.sub(
      priceAfterFees.mul(BigNumber.from(revenueSplitBpsA)).div(10000)
    );

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(priceAfterFill));
    expect(sellerBalanceAfter).eq(sellerBalanceBefore.add(priceAfterFees));
    expect(sellerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
    expect(buyerNftBalanceAfter).to.eq(fillAmount);
  });

  it("Rarible V3 Order data - 2 origin fees Build and fill ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const revenueSplitBpsA = "100";
    const revenueSplitBpsB = "150";
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      payouts: [],
      originFeeFirst: { account: charlie.address, value: revenueSplitBpsA },
      originFeeSecond: { account: dan.address, value: revenueSplitBpsB },
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      referrer: "reservoir.market",
      amount: mintTokensAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
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

    expect(buyerBalanceAfter).to.be.eq(0);
    expect(sellerBalanceAfter).to.eq(priceAfterFees);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(mintTokensAmount);
  });

  it("Rarible V3 Order data - 2 origin fees Build and partial ERC1155 WETH sell order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;
    const mintTokensAmount = 4;
    const fillAmount = 2;
    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, Rarible.Addresses.ERC20TransferProxy[chainId]);

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    // Mint erc1155 to seller
    await erc1155.connect(seller).mintMany(soldTokenId, mintTokensAmount);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the transfer manager
    await nft.approve(seller, Rarible.Addresses.NFTTransferProxy[chainId]);

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);
    // Build sell order
    const sellOrder = builder.build({
      maker: seller.address,
      side: "sell",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      price: price.toString(),
      tokenAmount: mintTokensAmount,
      payouts: [],
      // originFeeFirst: { account: charlie.address, value: '150' },
      // originFeeSecond: { account: dan.address, value: '100' },
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      // isMakeFill: false
    });

    // Sign the order
    await sellOrder.checkValidity();
    await sellOrder.sign(seller);
    await sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceBefore = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(sellerBalanceBefore).to.eq(0);
    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerNftBalanceBefore).to.eq(mintTokensAmount);
    expect(buyerNftBalanceBefore).to.eq(0);

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, {
      assetClass: "ERC1155",
      referrer: "reservoir.market",
      amount: fillAmount,
    });

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const sellerNftBalanceAfter = await nft.getBalance(
      seller.address,
      soldTokenId
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );
    const fillPrice = price.div(mintTokensAmount).mul(fillAmount);

    expect(buyerBalanceAfter).to.be.eq(buyerBalanceBefore.sub(fillPrice));
    expect(sellerNftBalanceAfter).to.eq(mintTokensAmount - fillAmount);
    expect(buyerNftBalanceAfter).to.eq(fillAmount);
  });
});
