import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther, parseUnits } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { ItemType } from "@reservoir0x/sdk/src/router/v6/approval-proxy";
import { ExecutionInfo } from "@reservoir0x/sdk/src/router/v6/types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import * as seaportV15 from "../helpers/seaport-v1.5";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupConduit,
  setupNFTs,
} from "../../utils";

describe("[ReservoirV6_0_1] SeaportV15 listings", () => {
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
  let approvalProxy: Contract;
  let seaportV15Module: Contract;
  let swapModule: Contract;

  let conduitKey: string;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    approvalProxy = await ethers
      .getContractFactory("ReservoirApprovalProxy", deployer)
      .then((factory) =>
        factory.deploy(Sdk.SeaportBase.Addresses.ConduitController[chainId], router.address)
      );
    seaportV15Module = await ethers
      .getContractFactory("SeaportV15Module", deployer)
      .then((factory) =>
        factory.deploy(deployer.address, router.address, Sdk.SeaportV15.Addresses.Exchange[chainId])
      );
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

    conduitKey = await setupConduit(chainId, deployer, [approvalProxy.address]);
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
        seaportV15Module: await ethers.provider.getBalance(seaportV15Module.address),
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
        seaportV15Module: await contract.getBalance(seaportV15Module.address),
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

    const listings: seaportV15.Listing[] = [];
    const feesOnTop: BigNumber[] = [];
    for (let i = 0; i < listingsCount; i++) {
      listings.push({
        seller: getRandomBoolean() ? alice : bob,
        nft: {
          ...(getRandomBoolean()
            ? { kind: "erc721", contract: erc721 }
            : { kind: "erc1155", contract: erc1155 }),
          id: getRandomInteger(1, 10000),
        },
        paymentToken,
        price: parsePrice(getRandomFloat(0.0001, 2).toFixed(6)),
        isCancelled: partial && getRandomBoolean(),
      });
      if (chargeFees) {
        feesOnTop.push(parsePrice(getRandomFloat(0.0001, 0.1).toFixed(6)));
      }
    }
    await seaportV15.setupListings(listings);

    // Prepare executions

    const totalPrice = bn(listings.map(({ price }) => price).reduce((a, b) => bn(a).add(b), bn(0)));
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
                        // Send USDC to the Seaport module
                        recipient: seaportV15Module.address,
                        amount: listings
                          .map(({ price }, i) => bn(price).add(chargeFees ? feesOnTop[i] : 0))
                          .reduce((a, b) => bn(a).add(b), bn(0)),
                        isETH: false,
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
            module: seaportV15Module.address,
            data: seaportV15Module.interface.encodeFunctionData(
              `accept${useUsdc ? "ERC20" : "ETH"}Listings`,
              [
                listings.map((listing) => {
                  const order = {
                    parameters: {
                      ...listing.order!.params,
                      totalOriginalConsiderationItems: listing.order!.params.consideration.length,
                    },
                    numerator: 1,
                    denominator: 1,
                    signature: listing.order!.params.signature,
                    extraData: "0x",
                  };

                  if (useUsdc) {
                    return order;
                  } else {
                    return {
                      order,
                      price: listing.price,
                    };
                  }
                }),
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
              ]
            ),
            value: useUsdc
              ? 0
              : totalPrice.add(
                  // Anything on top should be refunded
                  feesOnTop.reduce((a, b) => bn(a).add(b), bn(0)).add(parseEther("0.1"))
                ),
          }
        : {
            module: seaportV15Module.address,
            data: seaportV15Module.interface.encodeFunctionData(
              `accept${useUsdc ? "ERC20" : "ETH"}Listing`,
              [
                ...listings.map((listing) => ({
                  parameters: {
                    ...listing.order!.params,
                    totalOriginalConsiderationItems: listing.order!.params.consideration.length,
                  },
                  numerator: 1,
                  denominator: 1,
                  signature: listing.order!.params.signature,
                  extraData: "0x",
                })),
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
              ]
            ),
            value: useUsdc
              ? 0
              : totalPrice.add(
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
    expect(balancesAfter.seaportV15Module).to.eq(0);
    expect(balancesAfter.swapModule).to.eq(0);
  };

  // Test various combinations for filling listings

  for (const useUsdc of [false, true]) {
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

  it("ApprovalProxy - Fill ETH listing with USDC", async () => {
    // Setup

    // Maker: Alice
    // Taker: Bob
    const listing: seaportV15.Listing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      paymentToken: Sdk.Common.Addresses.Native[chainId],
      price: parseEther("0.5"),
    };

    const swapExecutions: ExecutionInfo[] = [
      // 1. Swap ETH for USDC (for testing purposes only)
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
                amountOut: parseUnits("10000", 6),
                amountInMaximum: parseEther("10"),
                sqrtPriceLimitX96: 0,
              },
              transfers: [
                {
                  recipient: bob.address,
                  amount: parseUnits("10000", 6),
                  toETH: false,
                },
              ],
            },
          ],
          bob.address,
          true,
        ]),
        // Anything on top should be refunded
        value: parseEther("10"),
      },
    ];

    // Swap to USDC
    await router.connect(bob).execute(swapExecutions, {
      value: swapExecutions.map(({ value }) => value).reduce((a, b) => bn(a).add(b)),
    });

    const erc20 = new Sdk.Common.Helpers.Erc20(
      ethers.provider,
      Sdk.Common.Addresses.Usdc[chainId][0]
    );
    await erc20.approve(
      bob,
      new Sdk.SeaportBase.ConduitController(chainId).deriveConduit(conduitKey)
    );

    await seaportV15.setupListings([listing]);

    // Prepare executions
    const executions: ExecutionInfo[] = [
      // 1. Swap USDC > WETH
      {
        module: swapModule.address,
        data: swapModule.interface.encodeFunctionData("erc20ToExactOutput", [
          [
            {
              params: {
                tokenIn: Sdk.Common.Addresses.Usdc[chainId][0],
                tokenOut: Sdk.Common.Addresses.WNative[chainId],
                fee: 500,
                recipient: swapModule.address,
                amountOut: bn(listing.price),
                amountInMaximum: parseUnits("10000", 6),
                sqrtPriceLimitX96: 0,
              },
              transfers: [
                {
                  recipient: seaportV15Module.address,
                  amount: bn(listing.price),
                  toETH: true,
                },
              ],
            },
          ],
          bob.address,
          true,
        ]),
        value: 0,
      },
      // 2. Fill ETH listing with the received funds
      {
        module: seaportV15Module.address,
        data: seaportV15Module.interface.encodeFunctionData("acceptETHListing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems: listing.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: listing.order!.params.signature,
            extraData: "0x",
          },
          {
            fillTo: bob.address,
            refundTo: bob.address,
            revertIfIncomplete: true,
            amount: listing.price,
            token: listing.paymentToken!,
          },
          [],
        ]),
        // The funds will come from the previous swap
        value: 0,
      },
    ];

    // Fetch pre-state

    const balancesBefore = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Execute

    await approvalProxy.connect(bob).bulkTransferWithExecute(
      [
        {
          items: [
            {
              itemType: ItemType.ERC20,
              token: Sdk.Common.Addresses.Usdc[chainId][0],
              identifier: 0,
              amount: parseUnits("10000", 6),
            },
          ],
          recipient: swapModule.address,
        },
      ],
      executions,
      conduitKey
    );

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);
    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Checks

    // Alice got the USDC
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(listing.price);

    // Bob got the NFT
    expect(await erc721.ownerOf(listing.nft.id)).to.eq(bob.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportV15Module).to.eq(0);
    expect(balancesAfter.swapModule).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportV15Module).to.eq(0);
    expect(ethBalancesAfter.swapModule).to.eq(0);
  });

  it("ApprovalProxy - Fill USDC listing", async () => {
    // Setup

    // Maker: Alice
    // Taker: Bob
    const listing: seaportV15.Listing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      paymentToken: Sdk.Common.Addresses.Usdc[chainId][0],
      price: parseUnits(getRandomFloat(0.0001, 2).toFixed(6), 6),
    };

    const swapExecutions: ExecutionInfo[] = [
      // 1. Swap ETH for USDC (for testing purposes only)
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
                amountOut: bn(listing.price),
                amountInMaximum: parseEther("10"),
                sqrtPriceLimitX96: 0,
              },
              transfers: [
                {
                  recipient: bob.address,
                  amount: bn(listing.price),
                  toETH: false,
                },
              ],
            },
          ],
          bob.address,
          true,
        ]),
        // Anything on top should be refunded
        value: parseEther("10"),
      },
    ];

    // Swap to USDC
    await router.connect(bob).execute(swapExecutions, {
      value: swapExecutions.map(({ value }) => value).reduce((a, b) => bn(a).add(b)),
    });

    const erc20 = new Sdk.Common.Helpers.Erc20(
      ethers.provider,
      Sdk.Common.Addresses.Usdc[chainId][0]
    );
    await erc20.approve(
      bob,
      new Sdk.SeaportBase.ConduitController(chainId).deriveConduit(conduitKey)
    );

    await seaportV15.setupListings([listing]);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      // 1. Fill USDC listing with the received funds
      {
        module: seaportV15Module.address,
        data: seaportV15Module.interface.encodeFunctionData("acceptERC20Listing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems: listing.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: listing.order!.params.signature,
            extraData: "0x",
          },
          {
            fillTo: bob.address,
            refundTo: bob.address,
            revertIfIncomplete: true,
            amount: listing.price,
            token: listing.paymentToken!,
          },
          [],
        ]),
        value: 0,
      },
    ];

    // Fetch pre-state

    const balancesBefore = await getBalances(Sdk.Common.Addresses.Usdc[chainId][0]);

    // Execute

    await approvalProxy.connect(bob).bulkTransferWithExecute(
      [
        {
          items: [
            {
              itemType: ItemType.ERC20,
              token: Sdk.Common.Addresses.Usdc[chainId][0],
              identifier: 0,
              amount: bn(listing.price),
            },
          ],
          recipient: seaportV15Module.address,
        },
      ],
      executions,
      conduitKey
    );

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Usdc[chainId][0]);
    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Checks

    // Alice got the USDC
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(listing.price);

    // Bob got the NFT
    expect(await erc721.ownerOf(listing.nft.id)).to.eq(bob.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportV15Module).to.eq(0);
    expect(balancesAfter.swapModule).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportV15Module).to.eq(0);
    expect(ethBalancesAfter.swapModule).to.eq(0);
  });

  it("ApprovalProxy - Fill WETH listing with USDC", async () => {
    // Setup

    // Maker: Alice
    // Taker: Bob
    const listing: seaportV15.Listing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      paymentToken: Sdk.Common.Addresses.WNative[chainId],
      price: parseEther("0.5"),
    };

    const swapExecutions: ExecutionInfo[] = [
      // 1. Swap ETH for USDC (for testing purposes only)
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
                amountOut: parseUnits("10000", 6),
                amountInMaximum: parseEther("10"),
                sqrtPriceLimitX96: 0,
              },
              transfers: [
                {
                  recipient: bob.address,
                  amount: parseUnits("10000", 6),
                  toETH: false,
                },
              ],
            },
          ],
          bob.address,
          true,
        ]),
        // Anything on top should be refunded
        value: parseEther("10"),
      },
    ];

    // Swap to USDC
    await router.connect(bob).execute(swapExecutions, {
      value: swapExecutions.map(({ value }) => value).reduce((a, b) => bn(a).add(b)),
    });

    const erc20 = new Sdk.Common.Helpers.Erc20(
      ethers.provider,
      Sdk.Common.Addresses.Usdc[chainId][0]
    );
    await erc20.approve(
      bob,
      new Sdk.SeaportBase.ConduitController(chainId).deriveConduit(conduitKey)
    );
    await seaportV15.setupListings([listing]);

    // Prepare executions
    const executions: ExecutionInfo[] = [
      // 1. Swap USDC > WETH
      {
        module: swapModule.address,
        data: swapModule.interface.encodeFunctionData("erc20ToExactOutput", [
          [
            {
              params: {
                tokenIn: Sdk.Common.Addresses.Usdc[chainId][0],
                tokenOut: Sdk.Common.Addresses.WNative[chainId],
                fee: 500,
                recipient: swapModule.address,
                amountOut: bn(listing.price),
                amountInMaximum: parseUnits("10000", 6),
                sqrtPriceLimitX96: 0,
              },
              transfers: [
                {
                  recipient: seaportV15Module.address,
                  amount: listing.price,
                  toETH: false,
                },
              ],
            },
          ],
          bob.address,
          true,
        ]),
        value: 0,
      },
      // 2. Fill WETH listing with the received funds
      {
        module: seaportV15Module.address,
        data: seaportV15Module.interface.encodeFunctionData("acceptERC20Listing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems: listing.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: listing.order!.params.signature,
            extraData: "0x",
          },
          {
            fillTo: bob.address,
            refundTo: bob.address,
            revertIfIncomplete: true,
            amount: listing.price,
            token: listing.paymentToken!,
          },
          [],
        ]),
        value: 0,
      },
    ];

    // Fetch pre-state

    const balancesBefore = await getBalances(Sdk.Common.Addresses.WNative[chainId]);

    // Execute

    await approvalProxy.connect(bob).bulkTransferWithExecute(
      [
        {
          items: [
            {
              itemType: ItemType.ERC20,
              token: Sdk.Common.Addresses.Usdc[chainId][0],
              identifier: 0,
              amount: parseUnits("10000", 6),
            },
          ],
          recipient: swapModule.address,
        },
      ],
      executions,
      conduitKey
    );

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.WNative[chainId]);
    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.WNative[chainId]);

    // Checks

    // Alice got the USDC
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(listing.price);

    // Bob got the NFT
    expect(await erc721.ownerOf(listing.nft.id)).to.eq(bob.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportV15Module).to.eq(0);
    expect(balancesAfter.swapModule).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportV15Module).to.eq(0);
    expect(ethBalancesAfter.swapModule).to.eq(0);
  });

  it("Swap - Fill USDC listing with ETH", async () => {
    // Setup

    // Maker: Alice
    // Taker: Bob

    const listing: seaportV15.Listing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      paymentToken: Sdk.Common.Addresses.Usdc[chainId][0],
      price: parseUnits(getRandomFloat(0.0001, 2).toFixed(6), 6),
    };
    await seaportV15.setupListings([listing]);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      // 1. Swap ETH for USDC, sending the USDC to the Seaport module
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
                amountOut: listing.price,
                amountInMaximum: parseEther("10"),
                sqrtPriceLimitX96: 0,
              },
              transfers: [
                {
                  recipient: seaportV15Module.address,
                  amount: listing.price,
                  toETH: false,
                },
              ],
            },
          ],
          bob.address,
          true,
        ]),
        // Anything on top should be refunded
        value: parseEther("10"),
      },
      // 2. Fill USDC listing with the received funds
      {
        module: seaportV15Module.address,
        data: seaportV15Module.interface.encodeFunctionData("acceptERC20Listing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems: listing.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: listing.order!.params.signature,
            extraData: "0x",
          },
          {
            fillTo: bob.address,
            refundTo: bob.address,
            revertIfIncomplete: true,
            amount: listing.price,
            token: listing.paymentToken!,
          },
          [],
        ]),
        value: 0,
      },
    ];

    // Fetch pre-state

    const balancesBefore = await getBalances(Sdk.Common.Addresses.Usdc[chainId][0]);

    // Execute

    await router.connect(bob).execute(executions, {
      value: executions.map(({ value }) => value).reduce((a, b) => bn(a).add(b)),
    });

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Usdc[chainId][0]);
    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Checks

    // Alice got the USDC
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(listing.price);

    // Bob got the NFT
    expect(await erc721.ownerOf(listing.nft.id)).to.eq(bob.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportV15Module).to.eq(0);
    expect(balancesAfter.swapModule).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportV15Module).to.eq(0);
    expect(ethBalancesAfter.swapModule).to.eq(0);
  });

  // USDT has a few restrictions which we check here
  it("ApprovalProxy - Fill ETH listing with USDT", async () => {
    // Setup

    // Maker: Alice
    // Taker: Bob
    const listing: seaportV15.Listing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      paymentToken: Sdk.Common.Addresses.Native[chainId],
      price: parseEther("0.5"),
    };

    const erc20Currency = "0xdac17f958d2ee523a2206206994597c13d831ec7";
    const swapExecutions: ExecutionInfo[] = [
      // 1. Swap ETH for USDC (for testing purposes only)
      {
        module: swapModule.address,
        data: swapModule.interface.encodeFunctionData("ethToExactOutput", [
          [
            {
              params: {
                tokenIn: Sdk.Common.Addresses.WNative[chainId],
                tokenOut: erc20Currency,
                fee: 500,
                recipient: swapModule.address,
                amountOut: parseUnits("10000", 6),
                amountInMaximum: parseEther("10"),
                sqrtPriceLimitX96: 0,
              },
              transfers: [
                {
                  recipient: bob.address,
                  amount: parseUnits("10000", 6),
                  toETH: false,
                },
              ],
            },
          ],
          bob.address,
          true,
        ]),
        // Anything on top should be refunded
        value: parseEther("10"),
      },
    ];

    // Swap to USDC
    await router.connect(bob).execute(swapExecutions, {
      value: swapExecutions.map(({ value }) => value).reduce((a, b) => bn(a).add(b)),
    });

    const erc20 = new Sdk.Common.Helpers.Erc20(ethers.provider, erc20Currency);
    await erc20.approve(
      bob,
      new Sdk.SeaportBase.ConduitController(chainId).deriveConduit(conduitKey)
    );

    await seaportV15.setupListings([listing]);

    // Prepare executions
    const executions: ExecutionInfo[] = [
      // 1. Swap USDC > WETH
      {
        module: swapModule.address,
        data: swapModule.interface.encodeFunctionData("erc20ToExactOutput", [
          [
            {
              params: {
                tokenIn: erc20Currency,
                tokenOut: Sdk.Common.Addresses.WNative[chainId],
                fee: 500,
                recipient: swapModule.address,
                amountOut: bn(listing.price),
                amountInMaximum: parseUnits("10000", 6),
                sqrtPriceLimitX96: 0,
              },
              transfers: [
                {
                  recipient: seaportV15Module.address,
                  amount: bn(listing.price),
                  toETH: true,
                },
              ],
            },
          ],
          bob.address,
          true,
        ]),
        value: 0,
      },
      // 2. Fill ETH listing with the received funds
      {
        module: seaportV15Module.address,
        data: seaportV15Module.interface.encodeFunctionData("acceptETHListing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems: listing.order!.params.consideration.length,
            },
            numerator: 1,
            denominator: 1,
            signature: listing.order!.params.signature,
            extraData: "0x",
          },
          {
            fillTo: bob.address,
            refundTo: bob.address,
            revertIfIncomplete: true,
            amount: listing.price,
            token: listing.paymentToken!,
          },
          [],
        ]),
        // The funds will come from the previous swap
        value: 0,
      },
    ];

    // Fetch pre-state

    const balancesBefore = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Execute

    await approvalProxy.connect(bob).bulkTransferWithExecute(
      [
        {
          items: [
            {
              itemType: ItemType.ERC20,
              token: erc20Currency,
              identifier: 0,
              amount: parseUnits("10000", 6),
            },
          ],
          recipient: swapModule.address,
        },
      ],
      executions,
      conduitKey
    );

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);
    const ethBalancesAfter = await getBalances(Sdk.Common.Addresses.Native[chainId]);

    // Checks

    // Alice got the USDC
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(listing.price);

    // Bob got the NFT
    expect(await erc721.ownerOf(listing.nft.id)).to.eq(bob.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportV15Module).to.eq(0);
    expect(balancesAfter.swapModule).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportV15Module).to.eq(0);
    expect(ethBalancesAfter.swapModule).to.eq(0);
  });
});
