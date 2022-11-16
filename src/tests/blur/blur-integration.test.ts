import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import { wait } from "../utils/test";
import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { Blur, Common } from "@reservoir0x/sdk";
import { config } from "@/config/index";
import { parseEther } from "@ethersproject/units";
import * as orders from "@/orderbook/orders";
import { logger } from "@/common/logger";

import { testNFTAddr, operatorKey, operator2Key } from "../element/__fixtures__/test-accounts";
import axios from "axios";
import { setupNFTs } from "../utils/nft";
import { getOrder } from "../utils/order";

const operatorProvider = new Wallet(operatorKey, baseProvider);
const operator2Provider = new Wallet(operator2Key, baseProvider);

jest.setTimeout(1000 * 1000);

describe("BluTestnet", () => {
  const tokenId = 1;
  const chainId = config.chainId;
  const seller = operatorProvider;
  const buyer = operator2Provider;
  // test NFT contract
  const nftToken = new Contract(
    testNFTAddr,
    new Interface([
      "function safeMint(address to) public",
      "function balanceOf(address owner) public view returns(uint256)",
      "function ownerOf(uint256 _tokenId) external view returns (address)",
      "function setApprovalForAll(address _operator, bool _approved) external",
      "function transferFrom(address _from, address _to, uint256 _tokenId) external payable",
      "function isApprovedForAll(address _owner, address _operator) external view returns (bool)",
    ]),
    operatorProvider
  );

  const operator = Blur.Addresses.ExecutionDelegate[config.chainId];

  const indexInterval = 120 * 1000;

  test("sellERC721", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getNonce(baseProvider, seller.address);

    logger.info("BlurTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: nftToken.address,
      tokenId: tokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: Math.floor(Date.now() / 1000),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: hashNonce,
      expirationTime: Math.floor(Date.now() / 1000) + 86400,
      fees: [],
      salt: hashNonce,
      extraParams: "0x",
    });

    await sellOrder.sign(seller);

    const orderInfo: orders.blur.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    const orderId = sellOrder.hash();

    logger.info("BlurTestnet", `Save ${orderId} to database`);

    // Store order to database
    await orders.blur.save([orderInfo]);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching({
      trader: buyer.address,
    });

    // Fill order
    const fillTx = await exchange.fillOrder(buyer, sellOrder, buyOrder);

    logger.info("BlurTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);

    await fillTx.wait();

    logger.info("BlurTestnet", `Waiting... ${indexInterval}`);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("filled");
  });

  test("buyERC721", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const weth = new Common.Helpers.Weth(baseProvider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange contract for the buyer
    const approveTx = await weth.approve(buyer, Blur.Addresses.ExecutionDelegate[chainId]);

    await approveTx.wait();

    await wait(20 * 1000);

    const hashNonce = await exchange.getNonce(baseProvider, buyer.address);

    logger.info("BlurTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const buyOrder = builder.build({
      side: "buy",
      trader: buyer.address,
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      collection: nftToken.address,
      tokenId: tokenId,
      nonce: hashNonce,
      amount: "1",
      paymentToken: Common.Addresses.Weth[chainId],
      price,
      listingTime: Math.floor(Date.now() / 1000) - 86400,
      expirationTime: Math.floor(Date.now() / 1000) + 86400 * 7,
      extraParams: "0x",
      salt: 0,
      fees: [
        // {
        //   recipient: buyer.address,
        //   rate: 100, // 100/10000 = 0.01
        // }
      ],
    });

    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(baseProvider);

    const orderInfo: orders.blur.OrderInfo = {
      orderParams: buyOrder.params,
      metadata: {},
    };

    const orderId = buyOrder.hash();

    logger.info("BlurTestnet", `Save ${orderId} to database`);

    // Store order to database
    await orders.blur.save([orderInfo]);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const sellOrder = buyOrder.buildMatching({
      trader: seller.address,
      listingTime: Math.floor(Date.now() / 1000) - 86400,
      expirationTime: Math.floor(Date.now() / 1000) + 86400 * 7,
    });

    // Fill order
    const fillTx = await exchange.fillOrder(seller, buyOrder, sellOrder);

    logger.info("BlurTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);

    await fillTx.wait();

    logger.info("BlurTestnet", `Waiting... ${indexInterval}`);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("filled");
  });

  test("cancelSell", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getNonce(baseProvider, seller.address);

    logger.info("BlurTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: nftToken.address,
      tokenId: tokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: Math.floor(Date.now() / 1000),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: 0,
      expirationTime: Math.floor(Date.now() / 1000) + 86400,
      fees: [],
      salt: hashNonce,
      extraParams: "0x",
    });

    await sellOrder.sign(seller);

    const orderInfo: orders.blur.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    const orderId = sellOrder.hash();

    logger.info("BlurTestnet", `Save ${orderId} to database`);

    // Store order to database
    await orders.blur.save([orderInfo]);

    await wait(10 * 1000);

    const ordeStatus = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(ordeStatus)}`);

    // Create matching buy order
    const buyOrder = sellOrder.buildMatching({
      trader: buyer.address,
    });

    // Cancel order
    const cancelTx = await exchange.cancelOrder(seller, sellOrder);
    await cancelTx.wait();

    logger.info("BlurTestnet", `Cancel tx=${cancelTx.hash}`);

    let isReverted = false;

    // Fill order
    try {
      const fillTx = await exchange.fillOrder(buyer, sellOrder, buyOrder);
      logger.info("BlurTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);
      await fillTx.wait();
      logger.info("BlurTestnet", `Waiting... ${indexInterval}`);
    } catch (e) {
      isReverted = true;
    }

    expect(isReverted).toEqual(true);

    await wait(indexInterval);

    // Check order
    const orderAfter = await getOrder(orderId);
    logger.info("BlurTestnet", `Order status ${JSON.stringify(orderAfter)}`);
    expect(orderAfter?.fillability_status).toEqual("cancelled");
  });

  test("saveToAPI", async () => {
    await setupNFTs(nftToken, seller, buyer, tokenId, operator);

    const exchange = new Blur.Exchange(chainId);
    const builder = new Blur.Builders.SingleToken(chainId);
    const price = parseEther("0.001");

    const hashNonce = await exchange.getNonce(baseProvider, seller.address);

    logger.info("BlurTestnet", `hashNonce=${hashNonce}`);

    // Build Sell order
    const sellOrder = builder.build({
      side: "sell",
      trader: seller.address,
      collection: nftToken.address,
      tokenId: tokenId,
      amount: 1,
      paymentToken: Common.Addresses.Eth[chainId],
      price,
      listingTime: Math.floor(Date.now() / 1000),
      matchingPolicy: Blur.Addresses.StandardPolicyERC721[chainId],
      nonce: hashNonce,
      expirationTime: Math.floor(Date.now() / 1000) + 86400,
      fees: [],
      salt: hashNonce,
      extraParams: "0x",
    });

    await sellOrder.sign(seller);

    const orderId = sellOrder.hash();
    const postData = {
      orders: [
        {
          kind: "blur",
          data: sellOrder.params,
        },
      ],
    };

    const headers = {
      "X-Admin-Api-Key": config.adminApiKey,
    };

    try {
      await axios.post("http://localhost:3000/orders/v1", postData, {
        headers,
      });
      // console.log("data", data)
    } catch (e) {
      // console.log("error", e)
    }

    await wait(10 * 1000);
    const ordeStatus = await getOrder(orderId);
    expect(ordeStatus).not.toBe(null);
  });
});
