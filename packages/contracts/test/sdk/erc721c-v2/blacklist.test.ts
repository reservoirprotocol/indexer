/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-console */

import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as PaymentProcessorV2 from "@reservoir0x/sdk/src/payment-processor-v2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { constants } from "ethers";

import * as indexerHelper from "../../indexer-helper";
import { getChainId, getCurrentTimestamp, setupERC721CV2 } from "../../utils";

enum TransferSecurityLevels {
  Recommended = 0,
  Zero = 1,
  One = 2,
  Two = 3,
  Three = 4,
  Four = 5,
  Five = 6,
  Six = 7,
  Seven = 8
}

describe("ERC721C - V2 - Blacklist", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  beforeEach(async () => {
    // Reset Indexer
    await indexerHelper.reset();
    [deployer, alice, bob] = await ethers.getSigners();
  });

  const testCase = async (block: boolean, securityLevel: TransferSecurityLevels) => {
    const whitelist: {
      accounts: string[],
      codeHashes: string[]
    } = {
      accounts: [],
      codeHashes: []
    };

    const blacklist: {
      accounts: string[],
      codeHashes: string[]
    } = {
      accounts: [],
      codeHashes: []
    };

    const caller = PaymentProcessorV2.Addresses.Exchange[chainId];

    const contractBytecode = await ethers.provider.getCode(caller);
    const codeHash = ethers.utils.keccak256(contractBytecode);

    if (securityLevel === TransferSecurityLevels.Recommended || securityLevel === TransferSecurityLevels.Two) {
      if (!block) {
        whitelist.accounts.push(caller)
        whitelist.codeHashes.push(codeHash);
      }
    } else if (securityLevel === TransferSecurityLevels.One) {
      if (block) {
        blacklist.accounts.push(caller);
        blacklist.codeHashes.push(codeHash);
      }
    }

    const { erc721c: erc721, txIds } = await setupERC721CV2(deployer,
      securityLevel,
      whitelist,
      blacklist
    );

    for (const { type, tx } of txIds) {
      const {
        events
      } = await indexerHelper.doEventParsing(tx, false);
      const typeToEvents: any = {
        "setTransferValidator": "erc721c-transfer-validator-updated",
        "applyListToCollection": "erc721c-v2-applied-list-to-collection",
        "addCodeHashesToBlacklist": "erc721c-v2-added-code-hash-to-list",
        "addAccountsToWhitelist": "erc721c-v2-added-account-to-list",
        "addAccountsToBlacklist": "erc721c-v2-added-account-to-list",
        "removeAccountsFromBlacklist": "erc721c-v2-removed-account-from-list",
        "removeAccountsFromWhitelist": "erc721c-v2-removed-account-from-list",
        "removeCodeHashesFromWhitelist": "erc721c-v2-removed-code-hash-from-list",
        "removeCodeHashesFromBlacklist": "erc721c-v2-removed-code-hash-from-list",
        "setTransferSecurityLevelOfCollection": "erc721c-set-transfer-security-level"
      }

      if (typeToEvents[type]) {
        const eventName = typeToEvents[type];
        const matchEvents = events.filter((c: any) => c.subKind === eventName)
        expect(matchEvents.length).to.be.gte(1);
      }
    }

    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const boughtTokenId = Math.floor(Math.random() * 100000);
    const weth = new Common.Helpers.WNative(ethers.provider, chainId);

    // Mint weth to buyer
    await weth.deposit(buyer, price);
    await weth.deposit(seller, price);

    // Approve the exchange contract for the buyer
    await weth.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);
    await weth.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    // Mint erc721 to seller
    await erc721.connect(seller).mint(boughtTokenId);

    const nft = new Common.Helpers.Erc721(ethers.provider, erc721.address);

    // Approve the transfer manager
    await nft.approve(seller, PaymentProcessorV2.Addresses.Exchange[chainId]);
    await nft.approve(buyer, PaymentProcessorV2.Addresses.Exchange[chainId]);

    const exchange = new PaymentProcessorV2.Exchange(chainId);

    const buyerMasterNonce = await exchange.getMasterNonce(ethers.provider, buyer.address);
    const blockTime = await getCurrentTimestamp(ethers.provider);

    const builder = new PaymentProcessorV2.Builders.SingleToken(chainId);
    const orderParameters = {
      protocol: PaymentProcessorV2.Types.OrderProtocols.ERC721_FILL_OR_KILL,
      beneficiary: buyer.address,
      marketplace: constants.AddressZero,
      marketplaceFeeNumerator: "0",
      maker: buyer.address,
      tokenAddress: erc721.address,
      tokenId: boughtTokenId,
      amount: "1",
      itemPrice: price,
      expiration: (blockTime + 60 * 60).toString(),
      paymentMethod: Common.Addresses.WNative[chainId],
      masterNonce: buyerMasterNonce,
    };

    let order = builder.build(orderParameters);

    await order.sign(buyer);

    // Call the Indexer to save the order
    const saveResult = await indexerHelper.doOrderSaving({
      contract: erc721.address,
      kind: "erc721",
      currency: order.params.paymentMethod,
      // Refresh balance incase the local indexer doesn't have the state
      makers: [order.params.sellerOrBuyer],
      nfts: [
        {
          collection: erc721.address,
          tokenId: boughtTokenId.toString(),
          owner: seller.address,
        },
      ],
      orders: [
        // Order Info
        {
          // export name from the @/orderbook/index
          kind: "paymentProcessorV2",
          data: order.params,
        },
      ],
    });

    const orderInfo = saveResult[0];
    if (block) {
      expect(orderInfo.status).to.be.eq("filtered");
      return;
    }
    await exchange.fillOrder(seller, order, {
      taker: seller.address,
    })
  };

  it(`security level - Recommended - block`, async () => testCase(true, TransferSecurityLevels.Recommended));
  it(`security level - Recommended - pass`, async () => testCase(false, TransferSecurityLevels.Recommended));
  it(`security level - One - block`, async () => testCase(true, TransferSecurityLevels.One));
  it(`security level - One - pass`, async () => testCase(false, TransferSecurityLevels.One));
});
