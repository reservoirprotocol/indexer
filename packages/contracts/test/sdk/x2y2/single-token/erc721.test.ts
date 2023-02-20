import * as Common from "@reservoir0x/sdk/src/common";
import { bn, lc } from "@reservoir0x/sdk/src/utils";
import * as X2Y2 from "@reservoir0x/sdk/src/x2y2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import axios from "axios";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, reset } from "../../../utils";

// These tests depend on a X2Y2 API key
describe("X2Y2 - SingleToken Erc721", () => {
  const chainId = getChainId();

  let alice: SignerWithAddress;

  beforeEach(async () => {
    [alice] = await ethers.getSigners();
  });

  afterEach(reset);

  it("Fill sell order", async () => {
    const orders = await axios.get(
      "https://api.x2y2.org/api/orders?status=open",
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": String(process.env.X2Y2_API_KEY),
        },
      }
    );
    const orderData = orders.data.data[0];

    const order = new X2Y2.Order(chainId, {
      kind: "single-token",
      id: orderData.id,
      type: orderData.type,
      currency: orderData.currency,
      price: orderData.price,
      maker: orderData.maker,
      taker: orderData.taker,
      deadline: orderData.end_at,
      itemHash: orderData.item_hash,
      nft: {
        token: orderData.nft.token,
        tokenId: orderData.nft.token_id,
      },
    });

    const nft = new Common.Helpers.Erc721(
      ethers.provider,
      order.params.nft.token
    );

    const buyerBalanceBefore = await ethers.provider.getBalance(alice.address);
    const sellerBalanceBefore = await ethers.provider.getBalance(
      order.params.maker
    );
    const ownerBefore = await nft.getOwner(order.params.nft.tokenId!);

    expect(lc(ownerBefore)).to.eq(lc(order.params.maker));

    const exchange = new X2Y2.Exchange(
      chainId,
      String(process.env.X2Y2_API_KEY)
    );
    await exchange.fillOrder(alice, order, { source: "reservoir.market" });

    const buyerBalanceAfter = await ethers.provider.getBalance(alice.address);
    const sellerBalanceAfter = await ethers.provider.getBalance(
      order.params.maker
    );
    const ownerAfter = await nft.getOwner(order.params.nft.tokenId!);

    expect(buyerBalanceAfter).to.be.lt(
      buyerBalanceBefore.sub(order.params.price)
    );
    expect(sellerBalanceAfter.sub(sellerBalanceBefore)).to.eq(
      bn(order.params.price).sub(bn(order.params.price).mul(50).div(10000))
    );
    expect(lc(ownerAfter)).to.eq(lc(alice.address));
  });
});
