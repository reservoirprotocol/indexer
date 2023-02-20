import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Rarible from "@reservoir0x/sdk/src/rarible";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, reset, setupNFTs } from "../../../../utils";
import { BigNumber, constants } from "ethers";

//TODO: Add check signature check
describe("Rarible - SingleToken Cancel Erc1155", () => {
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

  it("Rarible V1 Order data - 1 payout | 2 origin fees - Build and cancel ERC1155 ETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        {
          account: charlie.address,
          value: "1000",
        },
        {
          account: dan.address,
          value: "1000",
        },
      ],
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V1 Order data - 2 payouts | 0 origin fees - Build and cancel ERC1155 ETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V1,
      payouts: [
        { account: seller.address, value: "5000" },
        { account: dan.address, value: "5000" },
      ],
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V2 Order data - 1 payout | 2 origin fees - Build and cancel ERC1155 ETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      originFees: [
        {
          account: charlie.address,
          value: "1000",
        },
        {
          account: dan.address,
          value: "1000",
        },
      ],
      isMakeFill: true,
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V2 Order data - 2 payouts | 2 origin fees - Build and cancel ERC1155 ETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [
        { account: seller.address, value: "5000" },
        { account: dan.address, value: "5000" },
      ],
      originFees: [
        {
          account: charlie.address,
          value: "1000",
        },
        {
          account: dan.address,
          value: "1000",
        },
      ],
      isMakeFill: true,
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V2 Order data - 1 payout | 0 origin fees - Build and cancel ERC1155 ETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V2,
      payouts: [{ account: seller.address, value: "10000" }],
      isMakeFill: true,
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V3 Order data - 0 origin fees - Build and cancel ERC1155 ETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: seller.address, value: "10000" }],
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      // originFeeFirst: {
      //   account: charlie.address,
      //   value: "1000",
      // },
      // originFeeSecond: {
      //   account: dan.address,
      //   value: "1000",
      // },
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V3 Order data - 1 origin fee - Build and cancel ERC1155 ETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: seller.address, value: "10000" }],
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      originFeeFirst: {
        account: charlie.address,
        value: "1000",
      },
      // originFeeSecond: {
      //   account: dan.address,
      //   value: "1000",
      // },
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V3 Order data - 2 origin fees - Build and cancel ERC1155 ETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: constants.AddressZero,
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: seller.address, value: "10000" }],
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      originFeeFirst: {
        account: charlie.address,
        value: "1000",
      },
      originFeeSecond: {
        account: dan.address,
        value: "1000",
      },
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V3 Order data - 0 origin fees Build and cancel ERC1155 WETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: seller.address, value: "10000" }],
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V3 Order data - 1 origin fee Build and cancel ERC1155 WETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: seller.address, value: "10000" }],
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      originFeeFirst: {
        account: charlie.address,
        value: "1000",
      },
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V3 Order data - 2 origin fees Build and cancel ERC1155 WETH sell order", async () => {
    const seller = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

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
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: seller.address, value: "10000" }],
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      originFeeFirst: {
        account: charlie.address,
        value: "1000",
      },
      originFeeSecond: {
        account: dan.address,
        value: "1000",
      },
    });

    await sellOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(seller, sellOrder);

    const orderFill = await exchange.getOrderFill(seller.provider!, sellOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V3 Order data - 0 origin fees Build and cancel ERC1155 WETH buy order", async () => {
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);

    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: buyer.address, value: "10000" }],
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
    });

    await buyOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(buyer, buyOrder);

    const orderFill = await exchange.getOrderFill(buyer.provider!, buyOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V3 Order data - 1 origin fee Build and cancel ERC1155 WETH buy order", async () => {
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);

    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: buyer.address, value: "10000" }],
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,

      originFeeSecond: {
        account: dan.address,
        value: "1000",
      },
    });

    await buyOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(buyer, buyOrder);

    const orderFill = await exchange.getOrderFill(buyer.provider!, buyOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });

  it("Rarible V3 Order data - 2 origin fees Build and cancel ERC1155 WETH buy order", async () => {
    const buyer = bob;
    const price = parseEther("1");
    const soldTokenId = 0;

    const exchange = new Rarible.Exchange(chainId);

    const builder = new Rarible.Builders.SingleToken(chainId);

    const buyOrder = builder.build({
      maker: buyer.address,
      side: "buy",
      tokenKind: "erc1155",
      contract: erc1155.address,
      tokenId: soldTokenId.toString(),
      price: price.toString(),
      tokenAmount: 1,
      paymentToken: Common.Addresses.Weth[chainId],
      startTime: 0,
      endTime: 0,
      orderType: Rarible.Constants.ORDER_TYPES.V2,
      dataType: Rarible.Constants.ORDER_DATA_TYPES.V3_SELL,
      payouts: [{ account: buyer.address, value: "10000" }],
      marketplaceMarker: "rarible",
      maxFeesBasePoint: 1000,
      originFeeFirst: {
        account: charlie.address,
        value: "1000",
      },
      originFeeSecond: {
        account: dan.address,
        value: "1000",
      },
    });

    await buyOrder.checkFillability(ethers.provider);

    // Cancel orders
    await exchange.cancelOrder(buyer, buyOrder);

    const orderFill = await exchange.getOrderFill(buyer.provider!, buyOrder);
    expect(orderFill).to.eq(constants.MaxUint256);
  });
});
