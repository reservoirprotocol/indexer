import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as SuperRare from "@reservoir0x/sdk/src/superrare";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { reset, setupNFTs } from "../../../utils";
import { constants } from "ethers";
import { bn } from "@reservoir0x/sdk/src/utils";

describe("SuperRare - SingleToken Erc721", () => {
  const chainId = 1;

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Fill sell order", async () => {
    const seller = alice;
    const buyer = bob;
    const tokenId = 247;
    const price = parseEther("0.5");

    // Mint erc721 to the seller.
    await erc721.connect(seller).mint(tokenId);

    const exchange = new SuperRare.Exchange(chainId);

    // Approve the exchange for escrowing.
    await erc721.connect(seller).setApprovalForAll(exchange.baazar.address, true);
    await erc721.connect(seller).setApprovalForAll(exchange.exchange.address, true);

    expect(await erc721.ownerOf(tokenId), seller.address);

    // Create sell order.
    const order = new SuperRare.Order(chainId, {
      maker: seller.address,
      contract: erc721.address,
      tokenId: tokenId.toString(),
      price: price.toString(),
      currency: constants.AddressZero,
      splitAddresses: [seller.address],
      splitRatios: [100],
    });
    await exchange.createOrder(seller, order);

    // SuperRare escrows the NFT when creating sell orders.
    expect(await erc721.ownerOf(tokenId), exchange.exchange.address);

    const sellerEthBalanceBefore = await seller.getBalance();
    const buyerEthBalanceBefore = await buyer.getBalance();

    // Fill sell order.
    const fillTx = await exchange.fillOrder(buyer, order, {
      source: "reservoir.market",
    });
    const fillTxReceipt = await fillTx.wait();
    const gasPrice = fillTxReceipt.gasUsed.mul(fillTxReceipt.effectiveGasPrice);

    const sellerEthBalanceAfter = await seller.getBalance();
    const buyerEthBalanceAfter = await buyer.getBalance();

    // Buyers pay a 3% fee on all purchases.
    // Gallery receives a 15% commission on first sale.
    // Artists receive a 10% royalty payment for every subsequent sale.
    expect(sellerEthBalanceAfter.sub(sellerEthBalanceBefore)).to.eq(price.mul(8500).div(10000));
    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.eq(
      price.add(price.mul(3).div(100)).add(bn(gasPrice ?? 0))
    );
  });

  it("Fill sell order with splits", async () => {
    const seller = alice;
    const buyer = bob;
    const splitRatio = 90;
    const tokenId = 247;
    const price = parseEther("0.5");

    // Mint erc721 to the seller.
    await erc721.connect(seller).mint(tokenId);

    const exchange = new SuperRare.Exchange(chainId);

    // Approve the exchange for escrowing.
    await erc721.connect(seller).setApprovalForAll(exchange.baazar.address, true);
    await erc721.connect(seller).setApprovalForAll(exchange.exchange.address, true);

    expect(await erc721.ownerOf(tokenId), seller.address);

    // Create sell order.
    const order = new SuperRare.Order(chainId, {
      maker: seller.address,
      contract: erc721.address,
      tokenId: tokenId.toString(),
      price: price.toString(),
      currency: constants.AddressZero,
      splitAddresses: [seller.address, carol.address],
      splitRatios: [splitRatio, 100 - splitRatio],
    });
    await exchange.createOrder(seller, order);

    // SuperRare escrows the NFT when creating sell orders.
    expect(await erc721.ownerOf(tokenId), exchange.exchange.address);

    const sellerEthBalanceBefore = await seller.getBalance();
    const buyerEthBalanceBefore = await buyer.getBalance();
    const carolEthBalanceBefore = await carol.getBalance();

    // Fill sell order.
    const fillTx = await exchange.fillOrder(buyer, order, {
      source: "reservoir.market",
    });
    const fillTxReceipt = await fillTx.wait();
    const gasPrice = fillTxReceipt.gasUsed.mul(fillTxReceipt.effectiveGasPrice);

    const sellerEthBalanceAfter = await seller.getBalance();
    const buyerEthBalanceAfter = await buyer.getBalance();
    const carolEthBalanceAfter = await carol.getBalance();

    // Buyers pay a 3% fee on all purchases.
    // Gallery receives a 15% commission on first sale.
    // Artists receive a 10% royalty payment for every subsequent sale.
    expect(sellerEthBalanceAfter.sub(sellerEthBalanceBefore)).to.eq(
      price.mul(8500).div(10000).mul(splitRatio).div(100)
    );
    expect(buyerEthBalanceBefore.sub(buyerEthBalanceAfter)).to.eq(
      price.add(price.mul(3).div(100)).add(bn(gasPrice ?? 0))
    );
    expect(carolEthBalanceAfter.sub(carolEthBalanceBefore)).to.eq(
      price
        .mul(8500)
        .div(10000)
        .mul(100 - splitRatio)
        .div(100)
    );
  });
});
