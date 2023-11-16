import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Sdk from "@reservoir0x/sdk/src";
import * as PaymentProcessorV2 from "@reservoir0x/sdk/src/payment-processor-v2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("PaymentProcessorV2 - SingleToken ERC721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let erc721: Contract;
  let erc721New: Contract;
  let cosigner: SignerWithAddress;

  beforeEach(async () => {
    [deployer, alice, bob, cosigner] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
    ({ erc721: erc721New } = await setupNFTs(deployer));
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
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    await exchange.fillOrder(buyer, sellOrder, {
      taker: buyer.address,
    });

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    const buyOrder = builder.build(orderParameters);

    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await weth.getBalance(seller.address);

    await exchange.fillOrder(seller, buyOrder, {
      taker: buyer.address,
    });

    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });

  it("Build and direct fill multiple sell orders", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const soldTokenId2 = 2;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    await erc721New.connect(seller).mint(soldTokenId2);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);
    const nft2 = new Common.Helpers.Erc721(ethers.provider, erc721New.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);
    await nft2.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc721New.address,
      tokenId: soldTokenId2,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder2 = builder.build(orderParameters2);
    await sellOrder2.sign(seller);

    sellOrder2.checkSignature();
    await sellOrder2.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
        },
        {
          orderId: "2",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc721New.address,
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
      await buyer.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const ownerAfter2 = await nft2.getOwner(soldTokenId2);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price.mul(2));
    expect(ownerAfter).to.eq(buyer.address);
    expect(ownerAfter2).to.eq(buyer.address);
  });

  it("Build and direct fill multiple buy orders", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const soldTokenId2 = 2;

    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price.mul(2));

    // Approve the exchange contract for the buyer
    await weth.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    await erc721.connect(seller).mint(soldTokenId2);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    const buyOrder = builder.build(orderParameters);

    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId2,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    const buyOrder2 = builder.build(orderParameters2);

    await buyOrder2.sign(buyer);

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await weth.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillBidsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: buyOrder,
          price: price.toString(),
        },
        {
          orderId: "1",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId2.toString(),
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
      await seller.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const ownerAfter2 = await nft.getOwner(soldTokenId2);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price.mul(2));
    expect(ownerAfter).to.eq(buyer.address);
    expect(ownerAfter2).to.eq(buyer.address);
  });

  it("Build and fill multiple sell orders with sweepCollection", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const soldTokenId2 = 2;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    await erc721.connect(seller).mint(soldTokenId2);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId2,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
    };

    // Build sell order
    const sellOrder2 = builder.build(orderParameters2);
    await sellOrder2.sign(seller);

    sellOrder2.checkSignature();
    await sellOrder2.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
        },
        {
          orderId: "2",
          kind: "payment-processor-v2",
          contractKind: "erc721",
          contract: erc721.address,
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
      await buyer.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const ownerAfter2 = await nft.getOwner(soldTokenId2);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price.mul(2));
    expect(ownerAfter).to.eq(buyer.address);
    expect(ownerAfter2).to.eq(buyer.address);
  });

  it("Build and fill sell order with cosignature", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maxRoyaltyFeeNumerator: "0",
      maker: seller.address,
      tokenAddress: erc721.address,
      tokenId: soldTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: constants.AddressZero,
      masterNonce: sellerMasterNonce,
      cosigner: cosigner.address,
    };

    // Build sell order
    const sellOrder = builder.build(orderParameters);
    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    // Cosign the order
    if (sellOrder.isCosignedOrder()) {
      await sellOrder.cosign(cosigner, buyer.address);
    }

    await exchange.fillOrder(buyer, sellOrder, {
      taker: buyer.address,
    });

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price);
    expect(ownerAfter).to.eq(buyer.address);
  });
});
