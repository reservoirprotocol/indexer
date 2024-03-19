import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import * as Common from "@reservoir0x/sdk/src/common";
import * as PaymentProcessorV2 from "@reservoir0x/sdk/src/payment-processor-v2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("PaymentProcessorV2 - SingleToken Erc1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

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
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc1155.address,
      tokenId: soldTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    });

    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    // Create matching params
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    await exchange.fillOrder(buyer, sellOrder, {
      taker: buyer.address,
    });

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);
    const sellerNftBalanceAfter = await nft.getBalance(seller.address, soldTokenId);
    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, soldTokenId);

    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(1);
    expect(receiveAmount).to.gte(price);
  });

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const boughtTokenId = 10;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_OR_KILL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc1155.address,
      tokenId: boughtTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    });

    // Sign the order
    await buyOrder.sign(buyer);
    buyOrder.checkSignature();

    await buyOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await weth.getBalance(seller.address);

    await exchange.fillOrder(seller, buyOrder, {
      taker: buyer.address,
    });

    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    const sellerNftBalanceAfter = await nft.getBalance(seller.address, boughtTokenId);
    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, boughtTokenId);

    expect(receiveAmount).to.gte(price);
    expect(sellerNftBalanceAfter).to.eq(0);
    expect(buyerNftBalanceAfter).to.eq(1);
  });

  it("Build and fill sell order - partial fill", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const amount = 3;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(soldTokenId);
    await erc1155.connect(seller).mint(soldTokenId);
    await erc1155.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_PARTIAL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc1155.address,
      tokenId: soldTokenId,
      amount: amount,
      itemPrice: price.mul(amount),
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    });

    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    // Create matching params
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    await exchange.fillOrder(buyer, sellOrder, {
      taker: buyer.address,
      amount: "1",
    });

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);
    const sellerNftBalanceAfter = await nft.getBalance(seller.address, soldTokenId);
    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, soldTokenId);

    expect(sellerNftBalanceAfter).to.eq(2);
    expect(buyerNftBalanceAfter).to.eq(1);
    expect(receiveAmount).to.gte(price);
  });

  it("Build and fill buy order - partial", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const boughtTokenId = 10;
    const amount = 3;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price.mul(amount));

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(boughtTokenId);
    await erc1155.connect(seller).mint(boughtTokenId);
    await erc1155.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_PARTIAL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc1155.address,
      tokenId: boughtTokenId,
      amount: amount,
      itemPrice: price.mul(amount),
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    });

    // Sign the order
    await buyOrder.sign(buyer);
    buyOrder.checkSignature();

    await buyOrder.checkFillability(ethers.provider);
    const sellerBalanceBefore = await weth.getBalance(seller.address);

    await exchange.fillOrder(seller, buyOrder, {
      taker: buyer.address,
      amount: "1",
    });

    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    const sellerNftBalanceAfter = await nft.getBalance(seller.address, boughtTokenId);
    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, boughtTokenId);

    expect(receiveAmount).to.gte(price);
    expect(sellerNftBalanceAfter).to.eq(2);
    expect(buyerNftBalanceAfter).to.eq(1);
  });

  it("Build and fill buy order - partial - multiple", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const boughtTokenId = 10;
    const amount = 3;

    const boughtTokenId2 = 11;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price.mul(amount));

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(boughtTokenId);
    await erc1155.connect(seller).mint(boughtTokenId);
    await erc1155.connect(seller).mint(boughtTokenId);

    await erc1155.connect(seller).mint(boughtTokenId2);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);

    // Build buy order
    const buyOrder = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_PARTIAL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc1155.address,
      tokenId: boughtTokenId,
      amount: amount,
      itemPrice: price.mul(amount),
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    });

    // Sign the order
    await buyOrder.sign(buyer);
    buyOrder.checkSignature();

    await buyOrder.checkFillability(ethers.provider);

    // Build buy order
    const buyOrder2 = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_OR_KILL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc1155.address,
      tokenId: boughtTokenId2,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    });

    // Sign the order
    await buyOrder2.sign(buyer);
    buyOrder2.checkSignature();

    await buyOrder2.checkFillability(ethers.provider);

    const sellerBalanceBefore = await weth.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillBidsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc1155.address,
          tokenId: boughtTokenId.toString(),
          order: buyOrder,
          price: price.toString(),
          amount: 1,
        },
        {
          orderId: "2",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc1155.address,
          tokenId: boughtTokenId2.toString(),
          order: buyOrder2,
          price: price.toString(),
        },
      ],
      seller.address,
      {
        source: "reservoir.market",
      }
    );

    expect(nonPartialTx.txs.length).to.eq(1);

    for (const tx of nonPartialTx.txs) {
      delete tx.txData.gas
      await seller.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    const sellerNftBalanceAfter = await nft.getBalance(seller.address, boughtTokenId);
    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, boughtTokenId);

    expect(receiveAmount).to.gte(price.mul(2));
    expect(sellerNftBalanceAfter).to.eq(2);
    expect(buyerNftBalanceAfter).to.eq(1);
  });

  it("Build and fill sell order - partial - multiple", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const soldTokenId2 = 2;
    const amount = 3;

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(soldTokenId);
    await erc1155.connect(seller).mint(soldTokenId);
    await erc1155.connect(seller).mint(soldTokenId);

    await erc1155.connect(seller).mint(soldTokenId2);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);

    // Build sell order
    const sellOrder = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_PARTIAL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc1155.address,
      tokenId: soldTokenId,
      amount: amount,
      itemPrice: price.mul(amount),
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    });

    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellOrder2 = builder.build({
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC1155_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc1155.address,
      tokenId: soldTokenId2,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    });

    await sellOrder2.sign(seller);

    sellOrder2.checkSignature();
    await sellOrder2.checkFillability(ethers.provider);

    // Create matching params
    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc1155.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
        },
        {
          orderId: "2",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc1155.address,
          tokenId: soldTokenId2.toString(),
          order: sellOrder2,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
        },
      ],
      buyer.address,
      Sdk.Common.Addresses.Native[chainId],
      {
        source: "reservoir.market",
      }
    );

    expect(nonPartialTx.txs.length).to.eq(1);

    for (const tx of nonPartialTx.txs) {
      delete tx.txData.gas
      await buyer.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);
    const sellerNftBalanceAfter = await nft.getBalance(seller.address, soldTokenId);
    const buyerNftBalanceAfter = await nft.getBalance(buyer.address, soldTokenId);

    expect(sellerNftBalanceAfter).to.eq(2);
    expect(buyerNftBalanceAfter).to.eq(1);
    expect(receiveAmount).to.gte(price);
  });
});
