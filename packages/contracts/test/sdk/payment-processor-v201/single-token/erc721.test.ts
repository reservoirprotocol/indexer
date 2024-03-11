import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Sdk from "@reservoir0x/sdk/src";
import * as PaymentProcessorV201 from "@reservoir0x/sdk/src/payment-processor-v2.0.1";
import { Builders } from "@reservoir0x/sdk/src/payment-processor-base";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import { bn, getChainId, getCurrentTimestamp, reset, setupNFTs } from "../../../utils";

describe("PaymentProcessorV201 - SingleToken Erc721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let tom: SignerWithAddress;
  let erc721: Contract;
  let erc721New: Contract;
  let cosigner: SignerWithAddress;

  beforeEach(async () => {
    [deployer, alice, bob, cosigner, tom] = await ethers.getSigners();

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
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder = builder.build(orderParameters, PaymentProcessorV201.Order);
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
    await weth.approve(buyer, PaymentProcessorV201.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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

    const buyOrder = builder.build(orderParameters, PaymentProcessorV201.Order);

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
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);
    await nft2.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder = builder.build(orderParameters, PaymentProcessorV201.Order);
    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder2 = builder.build(orderParameters2, PaymentProcessorV201.Order);
    await sellOrder2.sign(seller);

    sellOrder2.checkSignature();
    await sellOrder2.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
    const deployerBalanceBefore = await ethers.provider.getBalance(deployer.address);
    const fee1 = bn(550);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2.0.1",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
          fees: [
            {
              amount: price.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
        },
        {
          orderId: "2",
          kind: "payment-processor-v2.0.1",
          contractKind: "erc721",
          contract: erc721New.address,
          tokenId: soldTokenId2.toString(),
          order: sellOrder2,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
          fees: [
            {
              amount: price.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
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
    const deployerBalanceAfter = await ethers.provider.getBalance(deployer.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const ownerAfter2 = await nft2.getOwner(soldTokenId2);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);
    const feeOnTopAmount = deployerBalanceAfter.sub(deployerBalanceBefore);

    expect(feeOnTopAmount).to.eq(price.mul(fee1).div(10000).mul(2));
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
    await weth.approve(buyer, PaymentProcessorV201.Addresses.Exchange[chainId]);
    await weth.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    await erc721.connect(seller).mint(soldTokenId2);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);
    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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

    const buyOrder = builder.build(orderParameters, PaymentProcessorV201.Order);

    await buyOrder.sign(buyer);

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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

    const buyOrder2 = builder.build(orderParameters2, PaymentProcessorV201.Order);

    await buyOrder2.sign(buyer);

    buyOrder.checkSignature();
    await buyOrder.checkFillability(ethers.provider);

    const sellerBalanceBefore = await weth.getBalance(seller.address);
    const deployerBalanceBefore = await weth.getBalance(deployer.address);
    const fee1 = bn(550);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillBidsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2.0.1",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: buyOrder,
          price: price.toString(),
          fees: [
            {
              amount: price.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
        },
        {
          orderId: "1",
          kind: "payment-processor-v2.0.1",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId2.toString(),
          order: buyOrder2,
          price: price.toString(),
          fees: [
            {
              amount: price.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
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
    const deployerBalanceAfter = await weth.getBalance(deployer.address);

    const ownerAfter = await nft.getOwner(soldTokenId);
    const ownerAfter2 = await nft.getOwner(soldTokenId2);

    const feeOnTopAmount = deployerBalanceAfter.sub(deployerBalanceBefore);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(feeOnTopAmount).to.eq(price.mul(fee1).div(10000).mul(2));
    expect(receiveAmount.add(feeOnTopAmount)).to.gte(price.mul(2));

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
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder = builder.build(orderParameters, PaymentProcessorV201.Order);
    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder2 = builder.build(orderParameters2, PaymentProcessorV201.Order);
    await sellOrder2.sign(seller);

    sellOrder2.checkSignature();
    await sellOrder2.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2.0.1",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
        },
        {
          orderId: "2",
          kind: "payment-processor-v2.0.1",
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
      delete tx.txData.gas
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

  it("Build and fill multiple sell orders with sweepCollection - with fee", async () => {
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
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder = builder.build(orderParameters, PaymentProcessorV201.Order);
    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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

    const fee1 = bn(550);

    // Build sell order
    const sellOrder2 = builder.build(orderParameters2, PaymentProcessorV201.Order);
    await sellOrder2.sign(seller);

    sellOrder2.checkSignature();
    await sellOrder2.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2.0.1",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
          fees: [
            {
              amount: price.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
        },
        {
          orderId: "2",
          kind: "payment-processor-v2.0.1",
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
      // Should switch to fillOrders when there has fee
      expect(
        tx.txData.data.includes(exchange.contract.interface.getSighash("sweepCollection"))
      ).to.eq(false);
      delete tx.txData.gas
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

  it("Build and fill sell order - cosignature", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder = builder.build(orderParameters, PaymentProcessorV201.Order);
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

  it("Build and fill multiple sell orders with - with fee - with relayer", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const soldTokenId2 = 2;
    const relayer = tom;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    await erc721.connect(seller).mint(soldTokenId2);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder = builder.build(orderParameters, PaymentProcessorV201.Order);
    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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

    const fee1 = bn(550);

    // Build sell order
    const sellOrder2 = builder.build(orderParameters2, PaymentProcessorV201.Order);
    await sellOrder2.sign(seller);

    sellOrder2.checkSignature();
    await sellOrder2.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2.0.1",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
          fees: [
            {
              amount: price.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
        },
        {
          orderId: "2",
          kind: "payment-processor-v2.0.1",
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
        relayer: relayer.address,
      }
    );

    expect(nonPartialTx.txs.length).to.eq(1);

    for (const tx of nonPartialTx.txs) {
      // Should switch to fillOrders when there has fee
      expect(
        tx.txData.data.includes(exchange.contract.interface.getSighash("sweepCollection"))
      ).to.eq(false);
      delete tx.txData.gas
      await relayer.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const ownerAfter2 = await nft.getOwner(soldTokenId2);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price.mul(2));
    expect(ownerAfter).to.eq(buyer.address);
    expect(ownerAfter2).to.eq(buyer.address);
  });

  it("Build and fill multiple sell orders with sweepCollection, fee, and relayer", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const soldTokenId2 = 2;
    const relayer = tom;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    await erc721.connect(seller).mint(soldTokenId2);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder = builder.build(orderParameters, PaymentProcessorV201.Order);
    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder2 = builder.build(orderParameters2, PaymentProcessorV201.Order);
    await sellOrder2.sign(seller);

    sellOrder2.checkSignature();
    await sellOrder2.checkFillability(ethers.provider);

    const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2.0.1",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
          fees: [],
        },
        {
          orderId: "2",
          kind: "payment-processor-v2.0.1",
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
        relayer: relayer.address,
      }
    );

    expect(nonPartialTx.txs.length).to.eq(1);

    for (const tx of nonPartialTx.txs) {
      // Should switch to fillOrders when there is a fee
      expect(
        tx.txData.data.includes(exchange.contract.interface.getSighash("sweepCollection"))
      ).to.eq(true);
      delete tx.txData.gas

      await relayer.sendTransaction(tx.txData);
    }

    const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);
    const ownerAfter = await nft.getOwner(soldTokenId);
    const ownerAfter2 = await nft.getOwner(soldTokenId2);
    const receiveAmount = sellerBalanceAfter.sub(sellerBalanceBefore);

    expect(receiveAmount).to.gte(price.mul(2));
    expect(ownerAfter).to.eq(buyer.address);
    expect(ownerAfter2).to.eq(buyer.address);
  });

  it("Build and fill multiple sell orders via a trusted channel", async () => {
    const buyer = alice;
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 1;
    const soldTokenId2 = 2;
    const relayer = tom;

    // Mint erc721 to seller
    await erc721.connect(seller).mint(soldTokenId);
    await erc721.connect(seller).mint(soldTokenId2);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the exchange
    await nft.approve(seller, PaymentProcessorV201.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV201.Exchange(chainId);

    const sellerMasterNonce = await exchange.getMasterNonce(ethers.provider, seller.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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
    const sellOrder = builder.build(orderParameters, PaymentProcessorV201.Order);
    await sellOrder.sign(seller);

    sellOrder.checkSignature();
    await sellOrder.checkFillability(ethers.provider);

    const orderParameters2 = {
      protocol: PaymentProcessorV201.Types.OrderProtocols.ERC721_FILL_OR_KILL,
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

    const fee1 = bn(550);

    // Build sell order
    const sellOrder2 = builder.build(orderParameters2, PaymentProcessorV201.Order);
    await sellOrder2.sign(seller);

    sellOrder2.checkSignature();
    await sellOrder2.checkFillability(ethers.provider);

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const nonPartialTx = await router.fillListingsTx(
      [
        {
          orderId: "0",
          kind: "payment-processor-v2.0.1",
          contractKind: "erc721",
          contract: erc721.address,
          tokenId: soldTokenId.toString(),
          order: sellOrder,
          currency: Sdk.Common.Addresses.Native[chainId],
          price: price.toString(),
          fees: [
            {
              amount: price.mul(fee1).div(10000),
              recipient: deployer.address,
            },
          ],
          extraArgs: {
            trustedChannel: constants.AddressZero,
          },
        },
        {
          orderId: "2",
          kind: "payment-processor-v2.0.1",
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
        relayer: relayer.address,
      }
    );

    const forwardSelector = new Interface([
      "function forwardCall(address target, bytes calldata message) external payable",
    ]).getSighash("forwardCall");

    expect(nonPartialTx.txs.length).to.eq(2);
    expect(nonPartialTx.txs[0].txData.data.includes(forwardSelector)).to.eq(true);
    expect(nonPartialTx.txs[1].txData.data.includes(forwardSelector)).to.eq(false);
  });
});
