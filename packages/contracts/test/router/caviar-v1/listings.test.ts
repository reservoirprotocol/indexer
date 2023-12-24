import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import { CaviarListing, setupCaviarListings } from "../helpers/caviar-v1";
import { bn, getRandomBoolean, getRandomFloat, getRandomInteger, reset } from "../../utils";

describe("[ReservoirV6_0_1] CaviarV1 listings", () => {
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let router: Contract;
  let caviarV1Module: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());

    caviarV1Module = await ethers
      .getContractFactory("CaviarV1Module", deployer)
      .then((factory) => factory.deploy(deployer.address, router.address));
  });

  const getBalances = async () => {
    return {
      alice: await ethers.provider.getBalance(alice.address),
      bob: await ethers.provider.getBalance(bob.address),
      carol: await ethers.provider.getBalance(carol.address),
      david: await ethers.provider.getBalance(david.address),
      emilio: await ethers.provider.getBalance(emilio.address),
      router: await ethers.provider.getBalance(router.address),
      caviarV1Module: await ethers.provider.getBalance(caviarV1Module.address),
    };
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
    listingsCount: number
  ) => {
    const listings: CaviarListing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < listingsCount; i++) {
      const erc721 = await ethers
        .getContractFactory("MockERC721", deployer)
        .then((factory) => factory.deploy());

      listings.push({
        seller: getRandomBoolean() ? alice : bob,
        nft: {
          contract: erc721,
          id: getRandomInteger(1, 10000),
        },
        price: parseEther(getRandomFloat(0.0001, 2).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      });

      if (chargeFees) {
        feesOnTop.push(parseEther(getRandomFloat(0.0001, 0.1).toFixed(6)));
      }
    }

    await setupCaviarListings(listings);

    const totalPrice = bn(
      listings
        .map(({ order }) => bn(order!.params.extra.prices[0]))
        .reduce((a, b) => a.add(b), bn(0))
    );

    const executions: ExecutionInfo[] = [
      // 1. Fill listings
      {
        module: caviarV1Module.address,
        data: caviarV1Module.interface.encodeFunctionData("buyWithETH", [
          listings.map((listing) => listing.order!.params.pool),
          listings.map((listing) => listing.nft.id),
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
        ]),
        value: totalPrice.add(
          // Anything on top should be refunded
          feesOnTop.reduce((a, b) => bn(a).add(b), bn(0)).add(parseEther("0.1"))
        ),
      },
    ];

    // Checks

    // If the `revertIfIncomplete` option is enabled and we have any
    // orders that are not fillable, the whole transaction should be
    // reverted
    if (partial && revertIfIncomplete && listings.some(({ isCancelled }) => isCancelled)) {
      await expect(
        router.connect(carol).execute(executions, {
          value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
        })
      ).to.be.revertedWith("reverted with custom error 'UnsuccessfulExecution()'");

      return;
    }

    // Fetch pre-state
    const ethBalancesBefore = await getBalances();
    const poolBalancesBefore = Object.fromEntries(
      await Promise.all(
        listings.map(async ({ order }) => [
          order!.params.pool,
          await ethers.provider.getBalance(order!.params.pool),
        ])
      )
    );

    // Execute
    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state
    const ethBalancesAfter = await getBalances();
    const poolBalancesAfter = Object.fromEntries(
      await Promise.all(
        listings.map(async ({ order }) => [
          order!.params.pool,
          await ethers.provider.getBalance(order!.params.pool),
        ])
      )
    );

    // Pools got the payments
    for (const { order, isCancelled } of listings) {
      const { pool } = order!.params;

      expect(poolBalancesAfter[pool].sub(poolBalancesBefore[pool])).to.eq(
        isCancelled ? bn(0) : bn(order!.params.extra.prices[0])
      );
    }

    // Emilio got the fee payments
    if (chargeFees) {
      // Fees are charged per execution, and since we have a single execution
      // here, we will have a single fee payment at the end adjusted over the
      // amount that was actually paid (eg. prices of filled orders)
      const actualPaid = listings
        .filter(({ isCancelled }) => !isCancelled)
        .map(({ order }) => bn(order!.params.extra.prices[0]))
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
        expect(await nft.contract.ownerOf(nft.id)).to.eq(carol.address);
      } else {
        expect(await nft.contract.ownerOf(nft.id)).to.eq(listings[i].seller.address);
      }
    }

    // Router is stateless
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.caviarV1Module).to.eq(0);
  };

  for (const multiple of [false, true]) {
    for (const partial of [false, true]) {
      for (const chargeFees of [false, true]) {
        for (const revertIfIncomplete of [false, true]) {
          it(
            "[eth]" +
              `${multiple ? "[multiple-orders]" : "[single-order]"}` +
              `${partial ? "[partial]" : "[full]"}` +
              `${chargeFees ? "[fees]" : "[no-fees]"}` +
              `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`,
            async () =>
              testAcceptListings(
                chargeFees,
                revertIfIncomplete,
                partial,
                multiple ? getRandomInteger(2, 6) : 1
              )
          );
        }
      }
    }
  }
});
