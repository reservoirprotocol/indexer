import { Interface } from "@ethersproject/abi";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import axios from "axios";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import {
  bn,
  getChainId,
  getRandomFloat,
  getRandomInteger,
  reset,
} from "../../../utils";

describe("[ReservoirV6_0_0] X2Y2 listings", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let router: Contract;
  let x2y2Module: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    router = (await ethers
      .getContractFactory("ReservoirV6_0_0", deployer)
      .then((factory) => factory.deploy())) as any;
    x2y2Module = (await ethers
      .getContractFactory("X2Y2Module", deployer)
      .then((factory) =>
        factory.deploy(router.address, router.address)
      )) as any;
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Eth[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        david: await ethers.provider.getBalance(david.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        x2y2Module: await ethers.provider.getBalance(x2y2Module.address),
      };
    } else {
      const contract = new Sdk.Common.Helpers.Erc20(ethers.provider, token);
      return {
        alice: await contract.getBalance(alice.address),
        bob: await contract.getBalance(bob.address),
        carol: await contract.getBalance(carol.address),
        david: await contract.getBalance(david.address),
        emilio: await contract.getBalance(emilio.address),
        router: await contract.getBalance(router.address),
        x2y2Module: await contract.getBalance(x2y2Module.address),
      };
    }
  };

  afterEach(reset);

  const testAcceptListings = async (
    // Whether to include fees on top
    chargeFees: boolean,
    // Number of listings to fill
    listingsCount: number
  ) => {
    // Setup

    // Taker: Carol
    // Fee recipient: Emilio

    const x2y2Interface = new Interface(
      require("../../../../artifacts/contracts/interfaces/IX2Y2.sol/IX2Y2.json").abi
    );

    const orders = await axios.get(
      "https://api.x2y2.org/api/orders?status=open",
      {
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": String(process.env.X2Y2_API_KEY),
        },
      }
    );

    const listings: Sdk.X2Y2.Order[] = [];
    const inputs: any[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < listingsCount; i++) {
      const orderData = orders.data.data[i];
      const order = new Sdk.X2Y2.Order(chainId, {
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
        royalty_fee: 0,
      });
      listings.push(order);

      const response = await axios.post(
        "https://api.x2y2.org/api/orders/sign",
        {
          caller: x2y2Module.address,
          op: Sdk.X2Y2.Types.Op.COMPLETE_SELL_OFFER,
          amountToEth: "0",
          amountToWeth: "0",
          items: [
            {
              orderId: order.params.id,
              currency: order.params.currency,
              price: order.params.price,
            },
          ],
        },
        {
          headers: {
            "Content-Type": "application/json",
            "X-Api-Key": process.env.X2Y2_API_KEY!,
          },
        }
      );
      const decodedFunctionData = x2y2Interface.decodeFunctionData(
        "run",
        x2y2Interface.getSighash("run") + response.data.data[0].input.slice(2)
      );
      inputs.push(decodedFunctionData.input);

      if (chargeFees) {
        feesOnTop.push(parseEther(getRandomFloat(0.0001, 0.1).toFixed(6)));
      }
    }

    // Prepare executions

    const totalPrice = bn(
      listings
        .map(({ params }) => params.price)
        .reduce((a, b) => bn(a).add(b), bn(0))
    );
    const executions: ExecutionInfo[] = [
      // 1. Fill listings
      listingsCount > 1
        ? {
            module: x2y2Module.address,
            data: x2y2Module.interface.encodeFunctionData("acceptETHListings", [
              inputs,
              {
                fillTo: carol.address,
                refundTo: carol.address,
                revertIfIncomplete: true,
                amount: totalPrice,
              },
              [
                ...feesOnTop.map((amount) => ({
                  recipient: emilio.address,
                  amount,
                })),
              ],
            ]),
            value: totalPrice.add(
              // Anything on top should be refunded
              feesOnTop
                .reduce((a, b) => bn(a).add(b), bn(0))
                .add(parseEther("0.1"))
            ),
          }
        : {
            module: x2y2Module.address,
            data: x2y2Module.interface.encodeFunctionData("acceptETHListing", [
              inputs[0],
              {
                fillTo: carol.address,
                refundTo: carol.address,
                revertIfIncomplete: true,
                amount: totalPrice,
              },
              [
                ...feesOnTop.map((amount) => ({
                  recipient: emilio.address,
                  amount,
                })),
              ],
            ]),
            value: totalPrice.add(
              // Anything on top should be refunded
              feesOnTop
                .reduce((a, b) => bn(a).add(b), bn(0))
                .add(parseEther("0.1"))
            ),
          },
    ];

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Eth[chainId]);

    // Checks

    // Carol got the NFTs from all orders
    for (let i = 0; i < listings.length; i++) {
      expect(
        await new Sdk.Common.Helpers.Erc721(
          ethers.provider,
          listings[i].params.nft.token
        ).contract.ownerOf(listings[i].params.nft.tokenId)
      ).to.eq(carol.address);
    }

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.x2y2Module).to.eq(0);
  };

  for (let multiple of [false, true]) {
    for (let chargeFees of [false, true]) {
      it(
        "[eth]" +
          `${multiple ? "[multiple-orders]" : "[single-order]"}` +
          `${chargeFees ? "[fees]" : "[no-fees]"}`,
        async () =>
          testAcceptListings(chargeFees, multiple ? getRandomInteger(2, 4) : 1)
      );
    }
  }
});
