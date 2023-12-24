import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther, parseUnits } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";
import { ZeroExV4Listing, setupZeroExV4Listings } from "../helpers/zeroex-v4";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
} from "../../utils";

describe("[ReservoirV6_0_1] ZeroExV4 listings", () => {
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
  let swapModule: Contract;
  let zeroExV4Module: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    swapModule = await ethers
      .getContractFactory("SwapModule", deployer)
      .then((factory) =>
        factory.deploy(
          deployer.address,
          router.address,
          Sdk.Common.Addresses.WNative[chainId],
          Sdk.Common.Addresses.SwapRouter[chainId]
        )
      );
    zeroExV4Module = await ethers
      .getContractFactory("ZeroExV4Module", deployer)
      .then((factory) =>
        factory.deploy(deployer.address, router.address, Sdk.ZeroExV4.Addresses.Exchange[chainId])
      );
  });

  const getBalances = async (token: string) => {
    if (token === Sdk.Common.Addresses.Native[chainId]) {
      return {
        alice: await ethers.provider.getBalance(alice.address),
        bob: await ethers.provider.getBalance(bob.address),
        carol: await ethers.provider.getBalance(carol.address),
        david: await ethers.provider.getBalance(david.address),
        emilio: await ethers.provider.getBalance(emilio.address),
        router: await ethers.provider.getBalance(router.address),
        zeroExV4Module: await ethers.provider.getBalance(zeroExV4Module.address),
        swapModule: await ethers.provider.getBalance(swapModule.address),
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
        zeroExV4Module: await contract.getBalance(zeroExV4Module.address),
        swapModule: await contract.getBalance(swapModule.address),
      };
    }
  };

  afterEach(reset);

  const testAcceptListings = async (
    // Whether to fill USDC or ETH listings
    useUsdc: boolean,
    // Whether to include fees on top
    chargeFees: boolean,
    // Whether to revert or not in case of any failures
    revertIfIncomplete: boolean,
    // Whether to cancel some orders in order to trigger partial filling
    partial: boolean,
    // Number of listings to fill
    listingsCount: number
  ) => {
    // Setup

    // Makers: Alice and Bob
    // Taker: Carol
    // Fee recipient: Emilio

    const paymentToken = useUsdc
      ? Sdk.Common.Addresses.Usdc[chainId][0]
      : Sdk.Common.Addresses.Native[chainId];
    const parsePrice = (price: string) => (useUsdc ? parseUnits(price, 6) : parseEther(price));
    const useERC1155 = getRandomBoolean();

    const listings: ZeroExV4Listing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < listingsCount; i++) {
      listings.push({
        seller: getRandomBoolean() ? alice : bob,
        nft: {
          ...(useERC1155
            ? { kind: "erc721", contract: erc721 }
            : { kind: "erc1155", contract: erc1155 }),
          id: getRandomInteger(1, 10000),
        },
        paymentToken: useUsdc
          ? Sdk.Common.Addresses.Usdc[chainId][0]
          : Sdk.ZeroExV4.Addresses.Native[chainId],
        price: parsePrice(getRandomFloat(0.0001, 2).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      });
      if (chargeFees) {
        feesOnTop.push(parsePrice(getRandomFloat(0.0001, 0.1).toFixed(6)));
      }
    }
    await setupZeroExV4Listings(listings);

    const totalPrice = bn(listings.map(({ price }) => price).reduce((a, b) => bn(a).add(b), bn(0)));

    // Prepare executions

    const tokenKind = listings[0].nft.kind.toUpperCase();
    const executions: ExecutionInfo[] = [
      // 1. When filling USDC listings, swap ETH to USDC (for testing purposes only)
      ...(useUsdc
        ? [
            {
              module: swapModule.address,
              data: swapModule.interface.encodeFunctionData("ethToExactOutput", [
                [
                  {
                    params: {
                      tokenIn: Sdk.Common.Addresses.WNative[chainId],
                      tokenOut: Sdk.Common.Addresses.Usdc[chainId][0],
                      fee: 500,
                      recipient: swapModule.address,
                      amountOut: listings
                        .map(({ price }, i) => bn(price).add(chargeFees ? feesOnTop[i] : 0))
                        .reduce((a, b) => bn(a).add(b), bn(0)),
                      amountInMaximum: parseEther("100"),
                      sqrtPriceLimitX96: 0,
                    },
                    transfers: [
                      {
                        recipient: zeroExV4Module.address,
                        amount: listings
                          .map(({ price }, i) => bn(price).add(chargeFees ? feesOnTop[i] : 0))
                          .reduce((a, b) => bn(a).add(b), bn(0)),
                        toETH: false,
                      },
                    ],
                  },
                ],
                // Refund to Carol
                carol.address,
                true,
              ]),
              // Anything on top should be refunded
              value: parseEther("100"),
            },
          ]
        : []),
      // 2. Fill listings
      listingsCount > 1
        ? {
            module: zeroExV4Module.address,
            data: zeroExV4Module.interface.encodeFunctionData(
              `accept${useUsdc ? "ERC20" : "ETH"}Listings${tokenKind}`,
              [
                listings.map((listing) => listing.order!.getRaw()),
                listings.map((listing) => listing.order!.getRaw()),
                tokenKind === "ERC1155"
                  ? listings.map((listing) => listing.nft.amount ?? "1")
                  : undefined,
                {
                  fillTo: carol.address,
                  refundTo: carol.address,
                  revertIfIncomplete,
                  amount: totalPrice,
                  // Only relevant when filling USDC listings
                  token: paymentToken,
                },
                [
                  ...feesOnTop.map((amount) => ({
                    recipient: emilio.address,
                    amount,
                  })),
                ],
              ].filter(Boolean)
            ),
            value: useUsdc
              ? 0
              : totalPrice.add(
                  // Anything on top should be refunded
                  feesOnTop.reduce((a, b) => bn(a).add(b), bn(0)).add(parsePrice("0.1"))
                ),
          }
        : {
            module: zeroExV4Module.address,
            data: zeroExV4Module.interface.encodeFunctionData(
              `accept${useUsdc ? "ERC20" : "ETH"}Listing${tokenKind}`,
              [
                listings[0].order!.getRaw(),
                listings[0].order!.getRaw(),
                tokenKind === "ERC1155" ? listings[0].nft.amount ?? "1" : undefined,
                {
                  fillTo: carol.address,
                  refundTo: carol.address,
                  revertIfIncomplete,
                  amount: totalPrice,
                  // Only relevant when filling USDC listings
                  token: paymentToken,
                },
                chargeFees
                  ? feesOnTop.map((amount) => ({
                      recipient: emilio.address,
                      amount,
                    }))
                  : [],
              ].filter(Boolean)
            ),
            value: useUsdc
              ? 0
              : totalPrice.add(
                  // Anything on top should be refunded
                  feesOnTop.reduce((a, b) => bn(a).add(b), bn(0)).add(parsePrice("0.1"))
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

    const balancesBefore = await getBalances(paymentToken);

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const balancesAfter = await getBalances(paymentToken);

    // Checks

    // Alice got the payment
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(
      listings
        .filter(({ seller, isCancelled }) => !isCancelled && seller.address === alice.address)
        .map(({ price }) => price)
        .reduce((a, b) => bn(a).add(b), bn(0))
    );
    // Bob got the payment
    expect(balancesAfter.bob.sub(balancesBefore.bob)).to.eq(
      listings
        .filter(({ seller, isCancelled }) => !isCancelled && seller.address === bob.address)
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
      expect(balancesAfter.emilio.sub(balancesBefore.emilio)).to.eq(
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
          expect(await nft.contract.ownerOf(nft.id)).to.eq(listings[i].seller.address);
        } else {
          expect(await nft.contract.balanceOf(listings[i].seller.address, nft.id)).to.eq(1);
        }
      }
    }

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.zeroExV4Module).to.eq(0);
    expect(balancesAfter.swapModule).to.eq(0);
  };

  for (const useUsdc of [true]) {
    for (const multiple of [false, true]) {
      for (const partial of [false, true]) {
        for (const chargeFees of [false, true]) {
          for (const revertIfIncomplete of [false, true]) {
            it(
              `${useUsdc ? "[usdc]" : "[eth]"}` +
                `${multiple ? "[multiple-orders]" : "[single-order]"}` +
                `${partial ? "[partial]" : "[full]"}` +
                `${chargeFees ? "[fees]" : "[no-fees]"}` +
                `${revertIfIncomplete ? "[reverts]" : "[skip-reverts]"}`,
              async () =>
                testAcceptListings(
                  useUsdc,
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
  }
});
