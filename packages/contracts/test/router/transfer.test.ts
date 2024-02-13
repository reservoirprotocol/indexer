import { Contract } from "@ethersproject/contracts";
import { AddressZero } from "@ethersproject/constants";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import * as ApprovalProxy from "@reservoir0x/sdk/src/router/v6/approval-proxy";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getChainId, reset, setupNFTs, setupRouterWithModules } from "../utils";

describe("Transfers via the router", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let carol: SignerWithAddress;

  let erc721: Contract;
  let erc1155: Contract;

  beforeEach(async () => {
    [deployer, alice, carol] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));
    await setupRouterWithModules(chainId, deployer);
  });

  afterEach(reset);

  it("Transfer via approval-proxy", async () => {
    const recipient = carol;

    const seller = alice;
    const tokenId1 = 0;

    const transferItem: ApprovalProxy.TransferItem = {
      items: [],
      recipient: recipient.address,
    };

    const price1 = parseEther("1");
    transferItem.items.push({
      itemType: ApprovalProxy.ItemType.NATIVE,
      identifier: "0",
      token: AddressZero,
      amount: price1,
    });

    {
      // Mint erc721 to seller
      await erc721.connect(seller).mint(tokenId1);
      transferItem.items.push({
        itemType: ApprovalProxy.ItemType.ERC721,
        identifier: tokenId1,
        token: erc721.address,
        amount: 1,
      });
    }

    const tokenId3 = 0;
    const totalAmount3 = 9;
    {
      // Mint erc1155 to seller
      await erc1155.connect(seller).mintMany(tokenId3, totalAmount3);

      transferItem.items.push({
        itemType: ApprovalProxy.ItemType.ERC1155,
        identifier: tokenId3,
        token: erc1155.address,
        amount: totalAmount3,
      });
    }

    const weth = new Sdk.Common.Helpers.WNative(ethers.provider, chainId);

    const price2 = parseEther("1");
    await weth.deposit(seller, price2);

    transferItem.items.push({
      itemType: ApprovalProxy.ItemType.ERC20,
      identifier: "0",
      token: weth.contract.address,
      amount: price2,
    });

    const ethBalanceBefore = await recipient.getBalance();
    const wethBalanceBefore = await weth.getBalance(recipient.address);

    const result = ApprovalProxy.createTransferTxsFromTransferItem(transferItem, seller.address);
    for (const tx of result.txs) {
      await seller.sendTransaction(tx.txData);
    }

    const ethBalanceAfter = await recipient.getBalance();
    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token3BuyerBalanceAfter = await erc1155.balanceOf(recipient.address, tokenId3);
    const wethBalanceAfter = await weth.getBalance(recipient.address);

    expect(token1OwnerAfter).to.eq(recipient.address);
    expect(token3BuyerBalanceAfter).to.eq(totalAmount3);

    expect(wethBalanceAfter.sub(wethBalanceBefore)).to.eq(price2);

    expect(ethBalanceAfter.sub(ethBalanceBefore)).to.eq(price1);
  });

  it("Transfer via router", async () => {
    const recipient = carol;

    const seller = alice;

    const transferItem: ApprovalProxy.TransferItem = {
      items: [],
      recipient: recipient.address,
    };

    const tokenId1 = 0;
    {
      // Mint erc721 to seller
      await erc721.connect(seller).mint(tokenId1);
      transferItem.items.push({
        itemType: ApprovalProxy.ItemType.ERC721,
        identifier: tokenId1,
        token: erc721.address.toLowerCase(),
        amount: 1,
      });
    }

    const tokenId2 = 0;
    const totalAmount2 = 9;
    {
      // Mint erc1155 to seller
      await erc1155.connect(seller).mintMany(tokenId2, totalAmount2);

      transferItem.items.push({
        itemType: ApprovalProxy.ItemType.ERC1155,
        identifier: tokenId2,
        token: erc1155.address.toLowerCase(),
        amount: totalAmount2,
      });
    }

    const router = new Sdk.RouterV6.Router(chainId, ethers.provider);
    const result = await router.transfersTx(transferItem, seller.address, {
      [erc721.address.toLowerCase()]: {
        seaport: true,
        reservoir: true,
      },
    });

    expect(result.txs.length).to.eq(2);

    for (const tx of result.txs) {
      for (const approval of tx.approvals) {
        await seller.sendTransaction(approval.txData);
      }
      await seller.sendTransaction(tx.txData);
    }

    const token1OwnerAfter = await erc721.ownerOf(tokenId1);
    const token3BuyerBalanceAfter = await erc1155.balanceOf(recipient.address, tokenId2);

    expect(token1OwnerAfter).to.eq(recipient.address);
    expect(token3BuyerBalanceAfter).to.eq(totalAmount2);
  });
});
