import { config as dotEnvConfig } from "dotenv";
dotEnvConfig();
import { baseProvider } from "@/common/provider";
import { Interface } from "@ethersproject/abi";
import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";

import { config } from "@/config/index";
import { testNFTAddr, operatorKey, operator2Key } from "./__fixtures__/test-accounts";
import { Infinity } from "@reservoir0x/sdk";
import { lc } from "@reservoir0x/sdk/dist/utils";
import { parseEther } from "ethers/lib/utils";
import { bn, now } from "@/common/utils";
import { Common } from "@reservoir0x/sdk";
import { BigNumberish, logger } from "ethers";
import * as orders from "@/orderbook/orders";

import { wait } from "tests/utils/test";
import { getOrder } from "tests/utils/order";
import { setupNFTs } from "tests/utils/nft";

const operatorProvider = new Wallet(operatorKey, baseProvider);
const operator2Provider = new Wallet(operator2Key, baseProvider);

const ONE_HOUR = 60 * 60;

jest.setTimeout(1000 * 1000);

describe("Infinity", () => {
  if (config.chainId !== 5) {
    throw new Error("Chain ID must be 5 (goerli)");
  }

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
    operatorProvider.provider
  );

  const exchangeAddress = Infinity.Addresses.Exchange[config.chainId];
  const indexInterval = 80 * 1000;

  test("takeSellERC721", async () => {
    /**
     * setup
     */
    await setupNFTs(nftToken, seller, buyer, tokenId, exchangeAddress);
    const currentOwner: string = await nftToken.ownerOf(`${tokenId}`);
    expect(lc(currentOwner)).toEqual(lc(seller.address));

    const exchange = new Infinity.Exchange(chainId);

    /**
     * build order
     */
    const nonce = await getMinOrderNonce(seller, exchange);
    const price = parseEther("0.001").toString();
    const startTime = now();
    const sellOrder = new Infinity.Builders.SingleToken(chainId).build({
      isSellOrder: true,
      signer: lc(seller.address),
      startPrice: price,
      endPrice: price,
      startTime: startTime - ONE_HOUR,
      endTime: startTime + ONE_HOUR,
      collection: lc(testNFTAddr),
      tokenId: `${tokenId}`,
      numTokens: 1,
      maxGasPrice: "0",
      nonce: nonce,
      currency: lc(Common.Addresses.Eth[chainId]),
    });
    await sellOrder.sign(seller);
    const orderInfo: orders.infinity.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    /**
     * save order to orderbook
     */
    const orderId = sellOrder.hash();
    logger.info("Infinity", `Save ${orderId} to database`);
    const result = await orders.infinity.save([orderInfo]);
    expect(result[0]?.status).toEqual("success");

    logger.info("InfinityTestnet", `Waiting... ${indexInterval}`);
    await wait(indexInterval);

    /**
     * check order is fillable
     */
    const orderStatus = await getOrder(orderId);
    logger.info("InfinityTestnet", `Order status ${JSON.stringify(orderStatus, null, 2)}`);
    expect(orderStatus?.fillability_status).toEqual("fillable");

    const fillTx = await exchange.takeMultipleOneOrders(buyer, sellOrder);
    logger.info("InfinityTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);
    await fillTx.wait();
    logger.info("InfinityTestnet", `Waiting... ${indexInterval}`);
    await wait(indexInterval);

    /**
     * check order was filled
     */
    const orderAfter = await getOrder(orderId);
    expect(orderAfter?.fillability_status).toEqual("filled");
  });

  test("takeOfferERC721", async () => {
    /**
     * setup
     */
    await setupNFTs(nftToken, seller, buyer, tokenId, exchangeAddress);
    const currentOwner: string = await nftToken.ownerOf(`${tokenId}`);
    expect(lc(currentOwner)).toEqual(lc(seller.address));

    const exchange = new Infinity.Exchange(chainId);

    /**
     * build offer
     */
    const nonce = await getMinOrderNonce(buyer, exchange);
    const startTime = now();
    const price = parseEther("0.001").toString();
    const offerOrder = new Infinity.Builders.SingleToken(chainId).build({
      isSellOrder: false,
      signer: lc(buyer.address),
      startPrice: price,
      endPrice: price,
      startTime: startTime - ONE_HOUR,
      endTime: startTime + ONE_HOUR,
      collection: lc(testNFTAddr),
      tokenId: `${tokenId}`,
      numTokens: 1,
      maxGasPrice: "0",
      nonce,
      currency: lc(Common.Addresses.Weth[chainId]),
    });

    /**
     * deposit weth
     */
    const weth = new Common.Helpers.Weth(baseProvider, chainId);
    await weth.deposit(buyer, price);
    /**
     * approve exchange contract to spend offerer WETH
     */
    const approveTx = await weth.approve(buyer, exchange.contract.address);
    await approveTx.wait();

    await offerOrder.sign(buyer);
    const orderInfo: orders.infinity.OrderInfo = {
      orderParams: offerOrder.params,
      metadata: {},
    };

    /**
     * save order to orderbook
     */
    const orderId = offerOrder.hash();
    logger.info("Infinity", `Save ${orderId} to database`);
    const result = await orders.infinity.save([orderInfo]);
    expect(result[0]?.status).toEqual("success");

    logger.info("InfinityTestnet", `Waiting... ${indexInterval}`);
    await wait(indexInterval);

    /**
     * check order is fillable
     */
    const orderStatus = await getOrder(orderId);
    logger.info("InfinityTestnet", `Order status ${JSON.stringify(orderStatus, null, 2)}`);
    expect(orderStatus?.fillability_status).toEqual("fillable");

    const fillTx = await exchange.takeMultipleOneOrders(seller, offerOrder);
    logger.info("InfinityTestnet", `Fill order=${orderId}, tx=${fillTx.hash}`);
    await fillTx.wait();
    logger.info("InfinityTestnet", `Waiting... ${indexInterval}`);
    await wait(indexInterval);

    /**
     * check order was filled
     */
    const orderAfter = await getOrder(orderId);
    expect(orderAfter?.fillability_status).toEqual("filled");
  });

  test("cancelOrderViaCancelMultiple", async () => {
    /**
     * setup
     */
    await setupNFTs(nftToken, seller, buyer, tokenId, exchangeAddress);
    const currentOwner: string = await nftToken.ownerOf(`${tokenId}`);
    expect(lc(currentOwner)).toEqual(lc(seller.address));

    const exchange = new Infinity.Exchange(chainId);

    /**
     * build order
     */
    const nonce = await getMinOrderNonce(seller, exchange);
    const price = parseEther("0.001").toString();
    const startTime = now();
    const sellOrder = new Infinity.Builders.SingleToken(chainId).build({
      isSellOrder: true,
      signer: lc(seller.address),
      startPrice: price,
      endPrice: price,
      startTime: startTime - ONE_HOUR,
      endTime: startTime + ONE_HOUR,
      collection: lc(testNFTAddr),
      tokenId: `${tokenId}`,
      numTokens: 1,
      maxGasPrice: "0",
      nonce: nonce,
      currency: lc(Common.Addresses.Eth[chainId]),
    });
    await sellOrder.sign(seller);
    const orderInfo: orders.infinity.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    /**
     * save order to orderbook
     */
    const orderId = sellOrder.hash();
    logger.info("Infinity", `Save ${orderId} to database`);
    const result = await orders.infinity.save([orderInfo]);
    expect(result[0]?.status).toEqual("success");

    logger.info("InfinityTestnet", `Waiting... ${indexInterval}`);
    await wait(indexInterval);

    /**
     * check order is fillable
     */
    const orderStatus = await getOrder(orderId);
    logger.info("InfinityTestnet", `Order status ${JSON.stringify(orderStatus, null, 2)}`);
    expect(orderStatus?.fillability_status).toEqual("fillable");

    const cancelTx = await exchange.cancelMultipleOrders(seller, [nonce]);

    logger.info("InfinityTestnet", `Cancel order=${orderId}, tx=${cancelTx.hash}`);
    await cancelTx.wait();
    logger.info("InfinityTestnet", `Waiting... ${indexInterval}`);
    await wait(indexInterval);

    /**
     * check order was cancelled
     */
    const orderAfter = await getOrder(orderId);
    expect(orderAfter?.fillability_status).toEqual("cancelled");
  });

  test("cancelOrderViaCancelAll", async () => {
    /**
     * setup
     */
    await setupNFTs(nftToken, seller, buyer, tokenId, exchangeAddress);
    const currentOwner: string = await nftToken.ownerOf(`${tokenId}`);
    expect(lc(currentOwner)).toEqual(lc(seller.address));

    const exchange = new Infinity.Exchange(chainId);

    /**
     * build order
     */
    const nonce = await getMinOrderNonce(seller, exchange);
    const price = parseEther("0.001").toString();
    const startTime = now();
    const sellOrder = new Infinity.Builders.SingleToken(chainId).build({
      isSellOrder: true,
      signer: lc(seller.address),
      startPrice: price,
      endPrice: price,
      startTime: startTime - ONE_HOUR,
      endTime: startTime + ONE_HOUR,
      collection: lc(testNFTAddr),
      tokenId: `${tokenId}`,
      numTokens: 1,
      maxGasPrice: "0",
      nonce: nonce,
      currency: lc(Common.Addresses.Eth[chainId]),
    });
    await sellOrder.sign(seller);
    const orderInfo: orders.infinity.OrderInfo = {
      orderParams: sellOrder.params,
      metadata: {},
    };

    /**
     * save order to orderbook
     */
    const orderId = sellOrder.hash();
    logger.info("Infinity", `Save ${orderId} to database`);
    const result = await orders.infinity.save([orderInfo]);
    expect(result[0]?.status).toEqual("success");

    logger.info("InfinityTestnet", `Waiting... ${indexInterval}`);
    await wait(indexInterval);

    /**
     * check order is fillable
     */
    const orderStatus = await getOrder(orderId);
    logger.info("InfinityTestnet", `Order status ${JSON.stringify(orderStatus, null, 2)}`);
    expect(orderStatus?.fillability_status).toEqual("fillable");

    const newMinNonce = bn(nonce).add(1);
    const cancelTx = await exchange.cancelAllOrders(seller, newMinNonce.toString());

    logger.info("InfinityTestnet", `Cancel order=${orderId}, tx=${cancelTx.hash}`);
    await cancelTx.wait();
    logger.info("InfinityTestnet", `Waiting... ${indexInterval}`);
    await wait(indexInterval);

    /**
     * check order was cancelled
     */
    const orderAfter = await getOrder(orderId);
    expect(orderAfter?.fillability_status).toEqual("cancelled");
  });
});

async function getMinOrderNonce(user: Wallet, exchange: Infinity.Exchange) {
  const minOrderNonce: BigNumberish = await exchange.contract
    .connect(user)
    .userMinOrderNonce(user.address);

  let minNonce = bn(minOrderNonce);

  while (!(await exchange.contract.connect(user).isNonceValid(user.address, minNonce))) {
    minNonce = minNonce.add(1);
  }

  if (minNonce.gt(minOrderNonce)) {
    try {
      await exchange.cancelAllOrders(user, minNonce.toString());
    } catch (err) {
      logger.warn("InfinityTestnet", `Error cancelling order ${err}`);
    }
  }

  return minNonce.toString();
}
