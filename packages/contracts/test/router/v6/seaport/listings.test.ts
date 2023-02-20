import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther, parseUnits } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import Permit2ABI from "@reservoir0x/sdk/src/common/abis/Permit2.json";
import ERC20ABI from "@reservoir0x/sdk/src/common/abis/Erc20.json";

import { ExecutionInfo } from "../helpers/router";
import {
  SeaportERC20Approval,
  SeaportListing,
  setupSeaportERC20Approvals,
  setupSeaportListings,
} from "../helpers/seaport";
import {
  bn,
  getChainId,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  reset,
  setupNFTs,
  setupTokens,
} from "../../../utils";

import { SignatureTransfer, AllowanceTransfer } from "@uniswap/permit2-sdk";

describe("[ReservoirV6_0_0] Seaport listings", () => {
  const chainId = getChainId();

  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let carol: SignerWithAddress;
  let david: SignerWithAddress;
  let emilio: SignerWithAddress;

  let erc1155: Contract;
  let erc721: Contract;
  // let erc20: Contract;
  let router: Contract;
  let seaportApprovalOrderZone: Contract;
  let seaportModule: Contract;
  let uniswapV3Module: Contract;
  let permit2: Contract;
  let permit2Module: Contract;
  let wethModule: Contract;

  beforeEach(async () => {
    [deployer, alice, bob, carol, david, emilio] = await ethers.getSigners();

    ({ erc721, erc1155 } = await setupNFTs(deployer));

    router = (await ethers
      .getContractFactory("ReservoirV6_0_0", deployer)
      .then((factory) => factory.deploy())) as any;
    seaportApprovalOrderZone = (await ethers
      .getContractFactory("SeaportApprovalOrderZone", deployer)
      .then((factory) => factory.deploy())) as any;
    seaportModule = (await ethers
      .getContractFactory("SeaportModule", deployer)
      .then((factory) =>
        factory.deploy(router.address, router.address)
      )) as any;
      wethModule = (await ethers
        .getContractFactory("WETHModule", deployer)
        .then((factory) => factory.deploy(deployer.address))) as any;
    uniswapV3Module = (await ethers
      .getContractFactory("UniswapV3Module", deployer)
      .then((factory) =>
        factory.deploy(router.address, router.address)
      )) as any;

    permit2 = new Contract(Sdk.Common.Addresses.Permit2[chainId], Permit2ABI);
    // erc20
    permit2Module = (await ethers
      .getContractFactory("Permit2Module", deployer)
      .then((factory) => factory.deploy(router.address))) as any;
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
        seaportModule: await ethers.provider.getBalance(seaportModule.address),
        uniswapV3Module: await ethers.provider.getBalance(
          uniswapV3Module.address
        ),
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
        seaportModule: await contract.getBalance(seaportModule.address),
        uniswapV3Module: await contract.getBalance(uniswapV3Module.address),
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
      ? Sdk.Common.Addresses.Usdc[chainId]
      : Sdk.Common.Addresses.Eth[chainId];
    const parsePrice = (price: string) =>
      useUsdc ? parseUnits(price, 6) : parseEther(price);

    const listings: SeaportListing[] = [];
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
    await setupSeaportListings(listings);

    // Prepare executions

    const totalPrice = bn(
      listings.map(({ price }) => price).reduce((a, b) => bn(a).add(b), bn(0))
    );
    const executions: ExecutionInfo[] = [
      // 1. When filling USDC listings, swap ETH to USDC on Uniswap V3 (for testing purposes only)
      ...(useUsdc
        ? [
            {
              module: uniswapV3Module.address,
              data: uniswapV3Module.interface.encodeFunctionData(
                "ethToExactOutput",
                [
                  {
                    tokenIn: Sdk.Common.Addresses.Weth[chainId],
                    tokenOut: Sdk.Common.Addresses.Usdc[chainId],
                    fee: 500,
                    // Send USDC to the Seaport module
                    recipient: seaportModule.address,
                    amountOut: listings
                      .map(({ price }, i) =>
                        bn(price).add(chargeFees ? feesOnTop[i] : 0)
                      )
                      .reduce((a, b) => bn(a).add(b), bn(0))
                      // Anything on top should be refunded
                      .add(parsePrice("1000")),
                    amountInMaximum: parseEther("100"),
                    sqrtPriceLimitX96: 0,
                  },
                  // Refund to Carol
                  carol.address,
                ]
              ),
              // Anything on top should be refunded
              value: parseEther("100"),
            },
          ]
        : []),
      // 2. Fill listings
      listingsCount > 1
        ? {
            module: seaportModule.address,
            data: seaportModule.interface.encodeFunctionData(
              `accept${useUsdc ? "ERC20" : "ETH"}Listings`,
              [
                listings.map((listing) => {
                  const order = {
                    parameters: {
                      ...listing.order!.params,
                      totalOriginalConsiderationItems:
                        listing.order!.params.consideration.length,
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
                  feesOnTop
                    .reduce((a, b) => bn(a).add(b), bn(0))
                    .add(parseEther("0.1"))
                ),
          }
        : {
            module: seaportModule.address,
            data: seaportModule.interface.encodeFunctionData(
              `accept${useUsdc ? "ERC20" : "ETH"}Listing`,
              [
                ...listings.map((listing) => ({
                  parameters: {
                    ...listing.order!.params,
                    totalOriginalConsiderationItems:
                      listing.order!.params.consideration.length,
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
                  feesOnTop
                    .reduce((a, b) => bn(a).add(b), bn(0))
                    .add(parseEther("0.1"))
                ),
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

    const balancesBefore = await getBalances(paymentToken);

    // Execute

    await router.connect(carol).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b), bn(0)),
    });

    // Fetch post-state

    const balancesAfter = await getBalances(paymentToken);

    // Checks

    // Alice got the payment
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(
      listings
        .filter(
          ({ seller, isCancelled }) =>
            !isCancelled && seller.address === alice.address
        )
        .map(({ price }) => price)
        .reduce((a, b) => bn(a).add(b), bn(0))
    );
    // Bob got the payment
    expect(balancesAfter.bob.sub(balancesBefore.bob)).to.eq(
      listings
        .filter(
          ({ seller, isCancelled }) =>
            !isCancelled && seller.address === bob.address
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
          expect(await nft.contract.ownerOf(nft.id)).to.eq(
            listings[i].seller.address
          );
        } else {
          expect(
            await nft.contract.balanceOf(listings[i].seller.address, nft.id)
          ).to.eq(1);
        }
      }
    }

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportModule).to.eq(0);
    expect(balancesAfter.uniswapV3Module).to.eq(0);
  };

  // Test various combinations for filling listings

  for (let useUsdc of [false, true]) {
    for (let multiple of [false, true]) {
      for (let partial of [false, true]) {
        for (let chargeFees of [false, true]) {
          for (let revertIfIncomplete of [false, true]) {
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

  it("Permit2 - Fill ETH listing with USDC", async () => {
    // Setup

    // Maker: Alice
    // Taker: Bob
    const listing: SeaportListing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      paymentToken: Sdk.Common.Addresses.Eth[chainId],
      price: parseEther('0.5'),
    };

    const swapExecutions: ExecutionInfo[] = [
      // 1. Swap ETH for USDC on UniswapV3, sending the USDC to the Seaport module
      {
        module: uniswapV3Module.address,
        data: uniswapV3Module.interface.encodeFunctionData("ethToExactOutput", [
          {
            tokenIn: Sdk.Common.Addresses.Weth[chainId],
            tokenOut: Sdk.Common.Addresses.Usdc[chainId],
            fee: 500,
            recipient: bob.address,
            amountOut: parseUnits("10000", 6),
            amountInMaximum: parseEther("10"),
            sqrtPriceLimitX96: 0,
          },
          bob.address,
        ]),
        // Anything on top should be refunded
        value: parseEther("10"),
      },
    ];

    // Swap USDC
    await router.connect(bob).execute(swapExecutions, {
      value: swapExecutions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b)),
    });

    const generatePermit2ModuleTransfer = async (
      signer: SignerWithAddress,
      to: string,
      token: string,
      module: string,
      amount: string
    ) => {
      const permitBatch = {
        details: [
          {
            token,
            amount,
            expiration: Math.floor(new Date().getTime() / 1000) + 86400,
            nonce: 0,
          },
        ],
        spender: module,
        sigDeadline: Math.floor(new Date().getTime() / 1000) + 86400,
      };

      const signatureData = AllowanceTransfer.getPermitData(
        permitBatch,
        Sdk.Common.Addresses.Permit2[chainId],
        chainId
      );

      const signature = await signer._signTypedData(
        signatureData.domain,
        signatureData.types,
        signatureData.values
      );

      return {
        permit: permitBatch,
        owner: signer.address,
        transferDetails: [
          {
            from: signer.address,
            to,
            amount,
            token,
          },
        ],
        signature,
      };
    };

    const erc20 = new Contract(Sdk.Common.Addresses.Usdc[chainId], ERC20ABI);
    await erc20
      .connect(bob)
      .approve(
        Sdk.Common.Addresses.Permit2[chainId],
        ethers.constants.MaxInt256
      );

    const permitModuleTransfer = await generatePermit2ModuleTransfer(
      bob,
      uniswapV3Module.address,
      Sdk.Common.Addresses.Usdc[chainId],
      permit2Module.address,
      parseUnits("10000", 6).toString()
    );

    await setupSeaportListings([listing]);

    // Prepare executions
    const executions: ExecutionInfo[] = [
      // 1. Transfer with permit2
      {
        module: permit2Module.address,
        data: permit2Module.interface.encodeFunctionData(`permitTransfer`, [
          permitModuleTransfer.owner,
          permitModuleTransfer.permit,
          permitModuleTransfer.transferDetails,
          permitModuleTransfer.signature,
        ]),
        value: 0,
      },
      // 2. Swap USDC > WETH
      {
        module: uniswapV3Module.address,
        data: uniswapV3Module.interface.encodeFunctionData("erc20ToExactOutput", [
          {
            tokenIn: Sdk.Common.Addresses.Usdc[chainId],
            tokenOut: Sdk.Common.Addresses.Weth[chainId],
            fee: 500,
            recipient: wethModule.address,
            amountOut: bn(listing.price),
            amountInMaximum: parseUnits("10000", 6),
            sqrtPriceLimitX96: 0,
          },
          bob.address,
        ]),
        // Anything on top should be refunded
        value: 0,
      },
      // 3. unwrap WETH to ETH
      {
        module: wethModule.address,
        data: wethModule.interface.encodeFunctionData("unwrap", [
          seaportModule.address,
        ]),
        // Anything on top should be refunded
        value: 0,
      },
      // 4. Fill USDC listing with the received funds
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("acceptETHListing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems:
                listing.order!.params.consideration.length,
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
        value: listing.price,
      },
    ];

    // Fetch pre-state

    const balancesBefore = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );
   
    // Execute

    await router.connect(bob).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b)),
    });

    // Fetch post-state
  
    const balancesAfter = await getBalances(Sdk.Common.Addresses.Eth[chainId]);
    const ethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );

    // Checks

    // Alice got the USDC
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(listing.price);

    // Bob got the NFT
    expect(await erc721.ownerOf(listing.nft.id)).to.eq(bob.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportModule).to.eq(0);
    expect(balancesAfter.uniswapV3Module).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportModule).to.eq(0);
    expect(ethBalancesAfter.uniswapV3Module).to.eq(0);
  });

  it("Permit2 - Fill listing with USDC", async () => {
    // Setup

    // Maker: Alice
    // Taker: Bob
    const listing: SeaportListing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      paymentToken: Sdk.Common.Addresses.Usdc[chainId],
      price: parseUnits(getRandomFloat(0.0001, 2).toFixed(6), 6),
    };

    const swapExecutions: ExecutionInfo[] = [
      // 1. Swap ETH for USDC on UniswapV3, sending the USDC to the Seaport module
      {
        module: uniswapV3Module.address,
        data: uniswapV3Module.interface.encodeFunctionData("ethToExactOutput", [
          {
            tokenIn: Sdk.Common.Addresses.Weth[chainId],
            tokenOut: Sdk.Common.Addresses.Usdc[chainId],
            fee: 500,
            recipient: bob.address,
            amountOut: bn(listing.price).add(
              // Anything on top should be refunded
              parseUnits("500", 6)
            ),
            amountInMaximum: parseEther("10"),
            sqrtPriceLimitX96: 0,
          },
          bob.address,
        ]),
        // Anything on top should be refunded
        value: parseEther("10"),
      },
    ];

    // Swap to USDC
    await router.connect(bob).execute(swapExecutions, {
      value: swapExecutions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b)),
    });
   
    const generatePermit2ModuleTransfer = async (
      signer: SignerWithAddress,
      to: string,
      token: string,
      module: string,
      amount: string
    ) => {

      const permitBatch = {
        details: [
          {
            token,
            amount,
            expiration: Math.floor(new Date().getTime() / 1000) + 86400,
            nonce: 0,
          },
        ],
        spender: module,
        sigDeadline: Math.floor(new Date().getTime() / 1000) + 86400,
      };

      const signatureData = AllowanceTransfer.getPermitData(
        permitBatch,
        Sdk.Common.Addresses.Permit2[chainId],
        chainId
      );

      const signature = await signer._signTypedData(
        signatureData.domain,
        signatureData.types,
        signatureData.values
      );

      return {
        permit: permitBatch,
        owner: signer.address,
        transferDetails: [
          {
            from: signer.address,
            to,
            amount,
            token,
          },
        ],
        signature,
      };
    };

    const erc20 = new Contract(Sdk.Common.Addresses.Usdc[chainId], ERC20ABI);
    await erc20
      .connect(bob)
      .approve(
        Sdk.Common.Addresses.Permit2[chainId],
        ethers.constants.MaxInt256
      );

    const permitModuleTransfer = await generatePermit2ModuleTransfer(
      bob,
      seaportModule.address,
      Sdk.Common.Addresses.Usdc[chainId],
      permit2Module.address,
      listing.price.toString()
    );

    await setupSeaportListings([listing]);

    // Prepare executions

    const usingPermitModule = true;
    const executions: ExecutionInfo[] = [
      // 1. Transfer with permit2
      {
        module: permit2Module.address,
        data: permit2Module.interface.encodeFunctionData(`permitTransfer`, [
          permitModuleTransfer.owner,
          permitModuleTransfer.permit,
          permitModuleTransfer.transferDetails,
          permitModuleTransfer.signature,
        ]),
        value: 0,
      },
      // 2. Fill USDC listing with the received funds
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("acceptERC20Listing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems:
                listing.order!.params.consideration.length,
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

    const balancesBefore = await getBalances(
      Sdk.Common.Addresses.Usdc[chainId]
    );

    // Execute

    await router.connect(bob).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b)),
    });

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Usdc[chainId]);
    const ethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );

    // Checks

    // Alice got the USDC
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(listing.price);

    // Bob got the NFT
    expect(await erc721.ownerOf(listing.nft.id)).to.eq(bob.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportModule).to.eq(0);
    expect(balancesAfter.uniswapV3Module).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportModule).to.eq(0);
    expect(ethBalancesAfter.uniswapV3Module).to.eq(0);
  });

  it("Permit2 - Fill WETH listing with USDC", async () => {
    // Setup

    // Maker: Alice
    // Taker: Bob
    const listing: SeaportListing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      paymentToken: Sdk.Common.Addresses.Weth[chainId],
      price: parseEther('0.5'),
    };

    const swapExecutions: ExecutionInfo[] = [
      // 1. Swap ETH for USDC on UniswapV3, sending the USDC to the Seaport module
      {
        module: uniswapV3Module.address,
        data: uniswapV3Module.interface.encodeFunctionData("ethToExactOutput", [
          {
            tokenIn: Sdk.Common.Addresses.Weth[chainId],
            tokenOut: Sdk.Common.Addresses.Usdc[chainId],
            fee: 500,
            recipient: bob.address,
            amountOut: parseUnits("10000", 6),
            amountInMaximum: parseEther("10"),
            sqrtPriceLimitX96: 0,
          },
          bob.address,
        ]),
        // Anything on top should be refunded
        value: parseEther("10"),
      },
    ];

    // Swap to USDC
    await router.connect(bob).execute(swapExecutions, {
      value: swapExecutions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b)),
    });

    const generatePermit2ModuleTransfer = async (
      signer: SignerWithAddress,
      to: string,
      token: string,
      module: string,
      amount: string
    ) => {
      const permitBatch = {
        details: [
          {
            token,
            amount,
            expiration: Math.floor(new Date().getTime() / 1000) + 86400,
            nonce: 0,
          },
        ],
        spender: module,
        sigDeadline: Math.floor(new Date().getTime() / 1000) + 86400,
      };

      const signatureData = AllowanceTransfer.getPermitData(
        permitBatch,
        Sdk.Common.Addresses.Permit2[chainId],
        chainId
      );

      const signature = await signer._signTypedData(
        signatureData.domain,
        signatureData.types,
        signatureData.values
      );

      return {
        permit: permitBatch,
        owner: signer.address,
        transferDetails: [
          {
            from: signer.address,
            to,
            amount,
            token,
          },
        ],
        signature,
      };
    };

    const erc20 = new Contract(Sdk.Common.Addresses.Usdc[chainId], ERC20ABI);
    await erc20
      .connect(bob)
      .approve(
        Sdk.Common.Addresses.Permit2[chainId],
        ethers.constants.MaxInt256
      );

    const permitModuleTransfer = await generatePermit2ModuleTransfer(
      bob,
      uniswapV3Module.address,
      Sdk.Common.Addresses.Usdc[chainId],
      permit2Module.address,
      parseUnits("10000", 6).toString()
    );

    await setupSeaportListings([listing]);

    // Prepare executions
    const executions: ExecutionInfo[] = [
      // 1. Transfer with permit2
      {
        module: permit2Module.address,
        data: permit2Module.interface.encodeFunctionData(`permitTransfer`, [
          permitModuleTransfer.owner,
          permitModuleTransfer.permit,
          permitModuleTransfer.transferDetails,
          permitModuleTransfer.signature,
        ]),
        value: 0,
      },
      // 2. Swap USDC > WETH
      {
        module: uniswapV3Module.address,
        data: uniswapV3Module.interface.encodeFunctionData("erc20ToExactOutput", [
          {
            tokenIn: Sdk.Common.Addresses.Usdc[chainId],
            tokenOut: Sdk.Common.Addresses.Weth[chainId],
            fee: 500,
            recipient: seaportModule.address,
            amountOut: bn(listing.price),
            amountInMaximum: parseUnits("10000", 6),
            sqrtPriceLimitX96: 0,
          },
          bob.address,
        ]),
        // Anything on top should be refunded
        value: 0,
      },
      // 3. Fill WETH listing with the received funds
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("acceptERC20Listing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems:
                listing.order!.params.consideration.length,
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

    const balancesBefore = await getBalances(
      Sdk.Common.Addresses.Weth[chainId]
    );
   
    // Execute

    await router.connect(bob).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b)),
    });

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Weth[chainId]);
    const ethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Weth[chainId]
    );

    // Checks

    // Alice got the USDC
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(listing.price);

    // Bob got the NFT
    expect(await erc721.ownerOf(listing.nft.id)).to.eq(bob.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportModule).to.eq(0);
    expect(balancesAfter.uniswapV3Module).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportModule).to.eq(0);
    expect(ethBalancesAfter.uniswapV3Module).to.eq(0);
  });

  it("Fill USDC listing with ETH", async () => {
    // Setup

    // Maker: Alice
    // Taker: Bob

    const listing: SeaportListing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      paymentToken: Sdk.Common.Addresses.Usdc[chainId],
      price: parseUnits(getRandomFloat(0.0001, 2).toFixed(6), 6),
    };
    await setupSeaportListings([listing]);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      // 1. Swap ETH for USDC on UniswapV3, sending the USDC to the Seaport module
      {
        module: uniswapV3Module.address,
        data: uniswapV3Module.interface.encodeFunctionData("ethToExactOutput", [
          {
            tokenIn: Sdk.Common.Addresses.Weth[chainId],
            tokenOut: Sdk.Common.Addresses.Usdc[chainId],
            fee: 500,
            recipient: seaportModule.address,
            amountOut: bn(listing.price).add(
              // Anything on top should be refunded
              parseUnits("500", 6)
            ),
            amountInMaximum: parseEther("10"),
            sqrtPriceLimitX96: 0,
          },
          bob.address,
        ]),
        // Anything on top should be refunded
        value: parseEther("10"),
      },
      // 2. Fill USDC listing with the received funds
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("acceptERC20Listing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems:
                listing.order!.params.consideration.length,
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

    const balancesBefore = await getBalances(
      Sdk.Common.Addresses.Usdc[chainId]
    );

    // Execute

    await router.connect(bob).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b)),
    });

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Usdc[chainId]);
    const ethBalancesAfter = await getBalances(
      Sdk.Common.Addresses.Eth[chainId]
    );

    // Checks

    // Alice got the USDC
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(listing.price);

    // Bob got the NFT
    expect(await erc721.ownerOf(listing.nft.id)).to.eq(bob.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportModule).to.eq(0);
    expect(balancesAfter.uniswapV3Module).to.eq(0);
    expect(ethBalancesAfter.router).to.eq(0);
    expect(ethBalancesAfter.seaportModule).to.eq(0);
    expect(ethBalancesAfter.uniswapV3Module).to.eq(0);
  });

  it("Fill USDC listing approval-less", async () => {
    // Setup

    // Maker: Alice
    // Taker: Bob

    const listing: SeaportListing = {
      seller: alice,
      nft: {
        kind: "erc721",
        contract: erc721,
        id: getRandomInteger(1, 10000),
      },
      paymentToken: Sdk.Common.Addresses.Usdc[chainId],
      price: parseUnits(getRandomFloat(0.0001, 2).toFixed(6), 6),
    };
    await setupSeaportListings([listing]);

    // In order to avoid giving USDC approval to the router (remember,
    // the router is supposed to be stateless), we do create a Seaport
    // order which gives the funds to the router (eg. offer = USDC and
    // consideration = USDC - with the router as a private recipient).
    // This way, the USDC approval will be made on the Seaport conduit
    // and the router stays stateless.

    const approval: SeaportERC20Approval = {
      giver: bob,
      filler: seaportModule.address,
      paymentToken: listing.paymentToken!,
      amount: listing.price,
      zone: seaportApprovalOrderZone.address,
    };
    await setupSeaportERC20Approvals([approval]);

    // Prepare executions

    const executions: ExecutionInfo[] = [
      // 1. Swap ETH for USDC and send it to Bob (for testing purposes only)
      {
        module: uniswapV3Module.address,
        data: uniswapV3Module.interface.encodeFunctionData("ethToExactOutput", [
          {
            tokenIn: Sdk.Common.Addresses.Weth[chainId],
            tokenOut: Sdk.Common.Addresses.Usdc[chainId],
            fee: 500,
            recipient: bob.address,
            amountOut: bn(listing.price).add(
              // Anything on top should be refunded
              parseUnits("100", 6)
            ),
            amountInMaximum: parseEther("10"),
            sqrtPriceLimitX96: 0,
          },
          bob.address,
        ]),
        // Anything on top should be refunded
        value: parseEther("10"),
      },
      // 2. Fill approval order, so that we avoid giving approval to the router
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("matchOrders", [
          [
            // Regular order
            {
              parameters: {
                ...approval.orders![0].params,
                totalOriginalConsiderationItems:
                  approval.orders![0].params.consideration.length,
              },
              signature: approval.orders![0].params.signature,
            },
            // Mirror order
            {
              parameters: {
                ...approval.orders![1].params,
                totalOriginalConsiderationItems:
                  approval.orders![1].params.consideration.length,
              },
              signature: "0x",
            },
          ],
          // Match the single offer item to the single consideration item
          [
            {
              offerComponents: [
                {
                  orderIndex: 0,
                  itemIndex: 0,
                },
              ],
              considerationComponents: [
                {
                  orderIndex: 0,
                  itemIndex: 0,
                },
              ],
            },
          ],
        ]),
        value: 0,
      },
      // 2. Fill USDC listing with the received funds
      {
        module: seaportModule.address,
        data: seaportModule.interface.encodeFunctionData("acceptERC20Listing", [
          {
            parameters: {
              ...listing.order!.params,
              totalOriginalConsiderationItems:
                listing.order!.params.consideration.length,
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

    const balancesBefore = await getBalances(
      Sdk.Common.Addresses.Usdc[chainId]
    );

    // Execute

    await router.connect(bob).execute(executions, {
      value: executions
        .map(({ value }) => value)
        .reduce((a, b) => bn(a).add(b)),
    });

    // Fetch post-state

    const balancesAfter = await getBalances(Sdk.Common.Addresses.Usdc[chainId]);

    // Checks

    // Alice got the USDC
    expect(balancesAfter.alice.sub(balancesBefore.alice)).to.eq(listing.price);

    // Bob got the NFT
    expect(await erc721.ownerOf(listing.nft.id)).to.eq(bob.address);

    // Router is stateless
    expect(balancesAfter.router).to.eq(0);
    expect(balancesAfter.seaportModule).to.eq(0);
    expect(balancesAfter.uniswapV3Module).to.eq(0);
  });
});
