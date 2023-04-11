
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as LooksRareV2 from "@reservoir0x/sdk/src/looks-rare-v2";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";

import {
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
} from "../../utils";

describe("LooksRareV2 - Bulk Erc721", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Check bulk signature", async () => {
    // Build sell order
    const buyer = alice;
    const seller = bob;

    const price = parseEther("1");
    const exchange = new LooksRareV2.Exchange(chainId);
   

    const builder = new LooksRareV2.Builders.SingleToken(chainId);
    let order = builder.build( {
        quoteType: LooksRareV2.Types.QuoteType.Bid,
        strategyId: 0,
        collectionType: LooksRareV2.Types.CollectionType.ERC721,
        signer: buyer.address,
        collection: erc721.address,
        itemId: 1,
        currency: Common.Addresses.Weth[chainId],
        price,
        globalNonce: (await exchange.getGlobalNonce(ethers.provider, buyer.address, "buy")),
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 86400 * 31,
    });

    let order2 = builder.build( {
        quoteType: LooksRareV2.Types.QuoteType.Bid,
        strategyId: 0,
        collectionType: LooksRareV2.Types.CollectionType.ERC721,
        signer: buyer.address,
        collection: erc721.address,
        itemId: 1,
        currency: Common.Addresses.Weth[chainId],
        price,
        globalNonce: (await exchange.getGlobalNonce(ethers.provider, buyer.address, "buy")),
        startTime: await getCurrentTimestamp(ethers.provider),
        endTime: (await getCurrentTimestamp(ethers.provider)) + 86400 * 31,
    });


    await LooksRareV2.Order.signBulkOrders(buyer,
    [
        order,
        order2
    ])

    order.checkSignature()
  });
});
