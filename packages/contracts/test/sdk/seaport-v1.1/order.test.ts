import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Common from "@reservoir0x/sdk/src/common";
import * as Seaport from "@reservoir0x/sdk/src/seaport-v1.1";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers, network } from "hardhat";

import {
  getChainId,
  getCurrentTimestamp,
  reset,
  setupNFTs,
} from "../../utils";

describe("Seaport - Order", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let dan: SignerWithAddress;

  let erc721: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, dan] = await ethers.getSigners();

    ({ erc721 } = await setupNFTs(deployer));
  });

  afterEach(reset);

  it("Fill Private Order", async () => {
    const orderData = {
      "kind": "single-token",
      "salt": "0x360c6ebe000000000000000000000000000000000000000087aef477f4180ff1",
      "zone": "0x004c00500000ad104d7dbd00e3ae0a5c00560c00",
      "offer": [
        {
          "token": "0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258",
          "itemType": 2,
          "endAmount": "1",
          "startAmount": "1",
          "identifierOrCriteria": "64064"
        }
      ],
      "counter": "0",
      "endTime": 1678715790,
      "offerer": "0x001588cab7a0b727c388174b1ef20b2e3d20d39b",
      "zoneHash": "0x0000000000000000000000000000000000000000000000000000000000000000",
      "orderType": 2,
      "signature": "0x7cf78b94363e51c5eba38cf53af4a96d368e6ed46676b1bf07a7e488d12fe5cb6b84b0e9e761ae841d0990f78b43da1a2cc4cae8e9cbfa0a089e66605c3377ab1c",
      "startTime": 1676300190,
      "conduitKey": "0x0000007b02230091a7ed01230072f7006a004d60a8d4e71d599b8104250f0000",
      "consideration": [
        {
          "token": "0x0000000000000000000000000000000000000000",
          "itemType": 0,
          "endAmount": "6502750000000000000",
          "recipient": "0x001588cab7a0b727c388174b1ef20b2e3d20d39b",
          "startAmount": "6502750000000000000",
          "identifierOrCriteria": "0"
        },
        {
          "token": "0x0000000000000000000000000000000000000000",
          "itemType": 0,
          "endAmount": "175750000000000000",
          "recipient": "0x0000a26b00c1f0df003000390027140000faa719",
          "startAmount": "175750000000000000",
          "identifierOrCriteria": "0"
        },
        {
          "token": "0x0000000000000000000000000000000000000000",
          "itemType": 0,
          "endAmount": "351500000000000000",
          "recipient": "0x37ceb4ba093d40234c6fb312d9791b67c04ef49a",
          "startAmount": "351500000000000000",
          "identifierOrCriteria": "0"
        },
        {
          "token": "0x34d85c9cdeb23fa97cb08333b511ac86e1c4e258",
          "itemType": 2,
          "endAmount": "1",
          "recipient": "0x86a06ed825860f52edf3395bea6801cee291adb6",
          "startAmount": "1",
          "identifierOrCriteria": "64064"
        }
      ]
    }
    const sellOrder = new Seaport.Order(chainId, orderData as Seaport.Types.OrderComponents)
    const exchange = new Seaport.Exchange(chainId);
    
    const offerItem = orderData.offer[0];
    const privateOrderItem = orderData.consideration.find(c => 
      c.token == offerItem.token &&
      c.identifierOrCriteria.toString() == offerItem.identifierOrCriteria.toString()
    )

    const mockAddress = privateOrderItem?.recipient!;

    const buyer = await ethers.getSigner(mockAddress);
    const nft = new Common.Helpers.Erc721(ethers.provider, offerItem.token);

    await network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [mockAddress],
    });

    await network.provider.request({
      method: "hardhat_setBalance",
      params: [mockAddress, "0x1000000000000000000"],
    });

    const matchParams = sellOrder.buildMatching();

    await sellOrder.checkFillability(ethers.provider);
    await sellOrder.checkSignature()

    // Match orders
    await exchange.fillOrder(buyer, sellOrder, matchParams, {
      source: "reservoir.market",
    });

    const ownerBefore = await nft.getOwner(offerItem.identifierOrCriteria.toString());

    expect(ownerBefore).to.eq(buyer.address);
  });
});
