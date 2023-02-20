import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Seaport from "@reservoir0x/sdk/src/seaport";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import {
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
} from "../../../utils";

describe("Seaport - ContractWide ERC1155", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol] = await ethers.getSigners();

    ({ erc1155 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Build and fill buy order", async () => {
    const buyer = alice;
    const seller = bob;
    const feeRecipient = carol;

    const price = parseEther("1");
    const fee = 250;
    const soldTokenId = 100;

    const weth = new Common.Helpers.Weth(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);

    // Approve the exchange for the buyer
    await weth.approve(buyer, Seaport.Addresses.Exchange[chainId]);

    // Approve the exchange for the seller
    await weth.approve(seller, Seaport.Addresses.Exchange[chainId]);

    // Mint erc1155 to seller
    await erc1155.connect(seller).mint(soldTokenId);

    const nft = new Common.Helpers.Erc1155(ethers.provider, erc1155.address);

    // Approve the exchange
    await nft.approve(seller, Seaport.Addresses.Exchange[chainId]);

    const exchange = new Seaport.Exchange(chainId);
    const builder = new Seaport.Builders.ContractWide(chainId);

    // Build buy order
    const buyOrder = builder.build({
      offerer: buyer.address,
      contract: erc1155.address,
      tokenKind: "erc1155",
      side: "buy",
      price,
      paymentToken: Common.Addresses.Weth[chainId],
      fees: [
        {
          recipient: feeRecipient.address,
          amount: price.mul(fee).div(10000),
        },
      ],
      startTime: await getCurrentTimestamp(ethers.provider),
      endTime: (await getCurrentTimestamp(ethers.provider)) + 60,
      counter: await exchange.getCounter(ethers.provider, buyer.address),
    });

    buyOrder.checkValidity();

    // Sign the order
    await buyOrder.sign(buyer);

    await buyOrder.checkFillability(ethers.provider);

    // Create matching sell order
    const matchParams = buyOrder.buildMatching({
      tokenId: soldTokenId,
    });

    const buyerBalanceBefore = await weth.getBalance(buyer.address);
    const sellerBalanceBefore = await weth.getBalance(seller.address);
    const feeRecipientBalanceBefore = await weth.getBalance(
      feeRecipient.address
    );
    const sellerNftBalanceBefore = await nft.getBalance(
      seller.address,
      soldTokenId
    );

    expect(buyerBalanceBefore).to.eq(price);
    expect(sellerBalanceBefore).to.eq(0);
    expect(feeRecipientBalanceBefore).to.eq(0);
    expect(sellerNftBalanceBefore).to.eq(1);

    // Match orders
    await exchange.fillOrder(seller, buyOrder, matchParams);

    const buyerBalanceAfter = await weth.getBalance(buyer.address);
    const sellerBalanceAfter = await weth.getBalance(seller.address);
    const feeRecipientBalanceAfter = await weth.getBalance(
      feeRecipient.address
    );
    const buyerNftBalanceAfter = await nft.getBalance(
      buyer.address,
      soldTokenId
    );

    expect(buyerBalanceAfter).to.eq(0);
    expect(sellerBalanceAfter).to.eq(price.sub(price.mul(fee).div(10000)));
    expect(feeRecipientBalanceAfter).to.eq(price.mul(fee).div(10000));
    expect(buyerNftBalanceAfter).to.eq(1);
  });
});
