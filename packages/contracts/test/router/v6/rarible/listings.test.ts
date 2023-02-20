import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import * as Rarible from "@reservoir0x/sdk/src/rarible";
import { encodeForMatchOrders } from "@reservoir0x/sdk/src/rarible/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import { RaribleListing, setupRaribleListings } from "../helpers/rarible";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
} from "../../../utils";

describe("[ReservoirV6_0_0] Rarible listings", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc1155: Contract;
  let erc721: Contract;
  let router: Contract;
  let raribleModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));

    router = (await ethers
      .getContractFactory("ReservoirV6_0_0", deployer)
      .then((factory) => factory.deploy())) as any;
    raribleModule = (await ethers
      .getContractFactory("RaribleModule", deployer)
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
        raribleModule: await ethers.provider.getBalance(raribleModule.address),
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
        raribleModule: await contract.getBalance(raribleModule.address),
      };
    }
  };

  afterEach(reset);

  const testAcceptListings = async (
    // Whether to include fees on top
    chargeFees: boolean,
    // Whether to revert or not in case of any failures
    revertIfIncomplete: boolean,
    // Whether to cancel some orders in order to trigger partial filling
    partial: boolean,
    // Number of listings to fill
    listingsCount: number,
    // Token kind
    kind: "erc721" | "erc1155"
  ) => {
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol
    // Fee recipient: Emilio

    const listings: RaribleListing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < listingsCount; i++) {
      listings.push({
        maker: getRandomBoolean() ? alice : bob,
        side: "sell",
        nft: {
          ...(kind === "erc721"
            ? { kind: "erc721", contract: erc721 }
            : { kind: "erc1155", contract: erc1155 }),
          id: getRandomInteger(1, 10000),
          amount: 1,
        },
        price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
        paymentToken: Sdk.Common.Addresses.Eth[chainId],
        isCancelled: partial && getRandomBoolean(),
      });
      if (chargeFees) {
        feesOnTop.push(parseEther(getRandomFloat(0.0001, 0.1).toFixed(6)));
      }
    }
    await setupRaribleListings(listings);

    // Prepare executions

    const totalPrice = bn(
      listings
        .map(({ price }) => bn(price))
        .reduce((a, b) => bn(a).add(b), bn(0))
    );

    const exchange = new Rarible.Exchange(chainId);

    const matchOrder = listings[0].order!.buildMatching(
      raribleModule.address,
      listings[0].order!.params
    );

    // matchOrder.dataType

    const priceTotalValue = totalPrice.add(
      // Anything on top should be refunded
      feesOnTop.reduce((a, b) => bn(a).add(b), bn(0)).add(parseEther("0.1"))
    );

    const executions: ExecutionInfo[] = [
      // 1. Fill listings
      listingsCount > 1
        ? {
            module: raribleModule.address,
            data: raribleModule.interface.encodeFunctionData(
              "acceptETHListings",
              [
                listings.map((listing) =>
                  encodeForMatchOrders(listing.order!.params)
                ),
                listings.map((listing) => listing.order!.params.signature),
                listings.map((listing) =>
                  encodeForMatchOrders(
                    listing.order!.buildMatching(
                      raribleModule.address,
                      listing.order!.params
                    )
                  )
                ),
                "0x",
                {
                  fillTo: carol.address,
                  refundTo: carol.address,
                  revertIfIncomplete,
                  amount: totalPrice,
                },
                [
                  ...feesOnTop.map((amount) => ({
                    recipient: emilio.address,
                    amount,
                  })),
                ],
              ]
            ),
            value: priceTotalValue,
          }
        : {
            module: raribleModule.address,
            data: raribleModule.interface.encodeFunctionData(
              "acceptETHListing",
              [
                encodeForMatchOrders(listings[0].order!.params),
                listings[0].order!.params.signature,
                encodeForMatchOrders(matchOrder),
                "0x",
                {
                  fillTo: carol.address,
                  refundTo: carol.address,
                  revertIfIncomplete,
                  amount: totalPrice,
                },
                chargeFees
                  ? feesOnTop.map((amount) => ({
                      recipient: emilio.address,
                      amount,
                    }))
                  : [],
              ]
            ),
            value: priceTotalValue,
          },
    ];

    // Checks

    // If the `revertIfIncomplete` option is enabled and we have any
    // orders that are not fillable, the whole transaction should be
    // reverted
    if (
      partial &&
      revertIfIncomplete &&
      listings.some(({ isCancelled }) => isCancelled)
    ) {
      await expect(
        router.connect(carol).execute(executions, {
          value: executions
            .map(({ value }) => value)
            .reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.revertedWith(
        "reverted with custom error 'UnsuccessfulExecution()'"
      );

      return;
    }

    // Fetch pre-state

    const ethBalancesBefore = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );
    const wethBalancesBefore = await getBalances(
      Sdk.Common.Addresses.Weth[chainId]
    );

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const ethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );
    const wethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Weth[chainId]
    );

    // Checks

    // Alice got the payment

    const aliceListings = listings.filter(
      ({ maker, isCancelled }) =>
        !isCancelled && maker.address === alice.address
    );
    // Checks

    // Alice got the payment
    expect(ethBalancesAfter.alice.sub(ethBalancesBefore.alice)).to.eq(
      listings
        .filter(
          ({ maker, isCancelled }) =>
            !isCancelled && maker.address === alice.address
        )
        .map(({ price }) => price)
        .reduce((a, b) => bn(a).add(b), bn(0))
    );
    // Bob got the payment
    expect(ethBalancesAfter.bob.sub(ethBalancesBefore.bob)).to.eq(
      listings
        .filter(
          ({ maker, isCancelled }) =>
            !isCancelled && maker.address === bob.address
        )
        .map(({ price }) => price)
        .reduce((a, b) => bn(a).add(b), bn(0))
    );

    // Emilio got the fee payments
    if (chargeFees) {
      // Fees are charged per execution, and since we have a single execution
      // here, we will have a single fee payment at the end adjusted over the
      // amount that was actually paid (eg. prices of filled orders)
      const actualPaid = listings
        .filter(({ isCancelled }) => !isCancelled)
        .map(({ price }) => price)
        .reduce((a, b) => bn(a).add(b), bn(0));
      expect(ethBalancesAfter.emilio.sub(ethBalancesBefore.emilio)).to.eq(
        listings
          .map((_, i) => feesOnTop[i].mul(actualPaid).div(totalPrice))
          .reduce((a, b) => bn(a).add(b), bn(0))
      );
    }

    // Carol got the NFTs from all filled orders
    for (let i = 0; i < listings.length; i++) {
      const nft = listings[i].nft;
      if (!listings[i].isCancelled) {
        if (nft.kind === "erc721") {
          expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
        } else {
          expect(await nft.contract.balanceOf(carol.address, nft.id)).to.eq(1);
        }
      } else {
        if (nft.kind === "erc721") {
          expect(await nft.contract.ownerOf(nft.id)).to.eq(
            listings[i].maker.address
          );
        } else {
          expect(
            await nft.contract.balanceOf(listings[i].maker.address, nft.id)
          ).to.eq(1);
        }
      }
    }

    // Router is stateless
    expect(wethBalancesAfter.router).to.eq(0);
    expect(wethBalancesAfter.raribleModule).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.raribleModule).to.eq(0);
  };

  for (let multiple of [false, true]) {
    for (let partial of [false, true]) {
      for (let chargeFees of [false, true]) {
        for (let revertIfIncomplete of [false, true]) {
          for (let kind of [false, true]) {
            it(
              "[eth]" +
                `${kind ? "[erc721]" : "[erc1555]"}` +
                `${multiple ? "[multiple-orders]" : "[single-order]"}` +
                `${partial ? "[partial]" : "[full]"}` +
                `${chargeFees ? "[fees]" : "[no-fees]"}` +
                `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`,
              async () =>
                testAcceptListings(
                  chargeFees,
                  revertIfIncomplete,
                  partial,
                  multiple ? getRandomInteger(2, 6) : 1,
                  kind ? "erc721" : "erc1155"
                )
            );
          }
        }
      }
    }
  }
});
