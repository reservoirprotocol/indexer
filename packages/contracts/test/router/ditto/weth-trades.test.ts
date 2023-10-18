import { BigNumber } from "@ethersproject/bignumber";
import { Contract, ContractReceipt } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import * as Sdk from "@reservoir0x/sdk/src";
import { generateSwapInfo } from "@reservoir0x/sdk/src/router/v6/swap";
import { expect } from "chai";
import { ethers } from "hardhat";

import { getDittoContracts } from "../helpers/ditto";
import { getChainId, reset } from "../../utils";

import DittoPoolAbi from "@reservoir0x/sdk/src/ditto/abis/DittoPool.json";

describe("DittoModule", () => {
  let chainId: number;
  let poolAddress: string;
  let initialTokenBalance: BigNumber;
  let deployer: SignerWithAddress;
  let marketMaker: SignerWithAddress;
  let trader: SignerWithAddress;
  let marketMakerLpId: BigNumber;

  let nft: Contract;
  let dittoPool: Contract;
  let dittoPoolFactory: Contract;

  let router: Contract;
  let dittoModule: Contract;
  let weth: Contract;
  let swapModule: Contract;

  // Random numbers that aren't likely to already have been minted
  const tokenId00 = ethers.BigNumber.from("0x13376969420123");
  const tokenId01 = ethers.BigNumber.from("0x13376969420124");

  beforeEach(async () => {
    chainId = getChainId();

    ({ nft, dittoPoolFactory } = getDittoContracts());

    weth = new Sdk.Common.Helpers.WNative(ethers.provider, chainId).contract;

    // Signers start off with 10,000 ETH
    [deployer, marketMaker, trader] = await ethers.getSigners();
    initialTokenBalance = parseEther("100");

    router = await ethers
      .getContractFactory("ReservoirV6_0_1", deployer)
      .then((factory) => factory.deploy());
    dittoModule = await ethers
      .getContractFactory("DittoModule", deployer)
      .then((factory) => factory.deploy(deployer.address, router.address));
    swapModule = await ethers
      .getContractFactory("SwapModule", deployer)
      .then((factory) =>
        factory.deploy(deployer.address, router.address, weth.address, ethers.constants.AddressZero)
      );

    const ownerAddress: string = await dittoPoolFactory.owner();
    const ownerSigner: SignerWithAddress = await ethers.getImpersonatedSigner(ownerAddress);
    await dittoPoolFactory.connect(ownerSigner).addRouters([dittoModule.address]);

    await nft.connect(marketMaker).mint(marketMaker.address, tokenId00);
    await nft.connect(marketMaker).mint(marketMaker.address, tokenId01);
    await nft.connect(marketMaker).setApprovalForAll(dittoPoolFactory.address, true);

    const deposit = await weth.connect(marketMaker).deposit({ value: initialTokenBalance });
    await deposit.wait();

    await weth.connect(marketMaker).approve(dittoPoolFactory.address, ethers.constants.MaxUint256);

    // Create a pool to trade with, with the NFTs deposited into the pool

    const poolTemplate = {
      isPrivatePool: false,
      templateIndex: 3, // LINEAR
      token: weth.address,
      nft: nft.address,
      feeLp: 0,
      owner: marketMaker.address,
      feeAdmin: 0,
      delta: ethers.utils.parseEther("1.01"),
      basePrice: ethers.utils.parseEther("3"),
      nftIdList: [tokenId00, tokenId01],
      initialTokenBalance: initialTokenBalance,
      templateInitData: "0x",
      referrer: "0x",
    };
    const poolManagerTemplate = {
      templateIndex: ethers.constants.MaxUint256,
      templateInitData: "0x",
    };
    const permitterTemplate = {
      templateIndex: ethers.constants.MaxUint256,
      templateInitData: "0x",
      liquidityDepositPermissionData: "0x",
    };
    const creation = await dittoPoolFactory
      .connect(marketMaker)
      .createDittoPool(poolTemplate, poolManagerTemplate, permitterTemplate);

    const result: ContractReceipt = await creation.wait();
    result.events!.forEach((event) => {
      if (event.event === "DittoPoolFactoryDittoPoolCreated") {
        poolAddress = event.args!.dittoPool;
      }
    });

    const dittoPoolInterface = new ethers.utils.Interface(DittoPoolAbi);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result.logs.forEach((log: any) => {
      try {
        const event = dittoPoolInterface.parseLog(log);
        if (event.name === "DittoPoolMarketMakeLiquidityCreated") {
          marketMakerLpId = event.args!.lpId;
        }
      } catch {
        return;
      }
    });

    dittoPool = new ethers.Contract(poolAddress, DittoPoolAbi, trader);
  });

  afterEach(reset);

  it("Purchase an NFT with unwrapped native ether", async () => {
    const wethBalanceTraderInitial = await weth.balanceOf(trader.address);
    expect(wethBalanceTraderInitial).to.equal(ethers.constants.Zero);

    // Fetch the current price
    const result = await dittoPool.getBuyNftQuote(2, "0x");
    const inputValue = result[3];
    const nftCostData = result[4];
    let quoteProtocolFee = ethers.BigNumber.from(0);
    for (const costData of nftCostData) {
      quoteProtocolFee = quoteProtocolFee.add(costData.fee.protocol);
    }
    const amountPayment: BigNumber = inputValue;

    const wrapInfo = await generateSwapInfo(
      chainId,
      ethers.getDefaultProvider(),
      "",
      Sdk.Common.Addresses.Native[chainId],
      weth.address,
      amountPayment,
      {
        module: swapModule,
        transfers: [
          {
            toETH: false,
            recipient: dittoModule.address,
            amount: amountPayment,
          },
        ],
        refundTo: trader.address,
        revertIfIncomplete: true,
      }
    );

    const fillTo: string = trader.address;
    const refundTo: string = trader.address;
    const revertIfIncomplete = true;

    const eRC20ListingParams = [fillTo, refundTo, revertIfIncomplete, weth.address, amountPayment];

    const recipient: string = dittoPool.address;
    const amountFee: BigNumber = parseEther("0");

    const fee = [recipient, amountFee];

    const dittoOrderParams = [dittoModule.address, [tokenId00, tokenId01], "0x"];

    const buyWithERC20 = [[dittoPool.address], [dittoOrderParams], eRC20ListingParams, [fee]];

    const data = dittoModule.interface.encodeFunctionData("buyWithERC20", buyWithERC20);
    const executions = [dittoModule.address, data, 0];
    const traderBalanceBefore = await trader.getBalance();
    const protocolFeeRecipient = await dittoPoolFactory.protocolFeeRecipient();
    const protocolFeeRecipientBalanceBefore = await weth.balanceOf(protocolFeeRecipient);
    const routerExecution = await router
      .connect(trader)
      .execute([wrapInfo.execution, executions], { value: amountPayment });

    const routerExecutionReceipt = await routerExecution.wait();
    const routerExecutionGasUsed = routerExecutionReceipt.gasUsed;
    const routerExecutionGasPrice = routerExecutionReceipt.effectiveGasPrice;
    const routerExecutionGasCost = routerExecutionGasUsed.mul(routerExecutionGasPrice);

    const tokenId00Owner = await nft.ownerOf(tokenId00);
    const tokenId01Owner = await nft.ownerOf(tokenId01);
    const ethBalanceTraderAfter = await trader.getBalance();
    expect(tokenId00Owner).to.eq(fillTo);
    expect(tokenId01Owner).to.eq(fillTo);
    expect(ethBalanceTraderAfter).to.equal(
      traderBalanceBefore.sub(amountPayment).sub(routerExecutionGasCost)
    );

    const protocolFeeRecipientWethBalanceAfter = await weth.balanceOf(protocolFeeRecipient);
    const wethBalanceDittoPoolAfter = await weth.balanceOf(dittoPool.address);

    expect(protocolFeeRecipientWethBalanceAfter).to.equal(
      protocolFeeRecipientBalanceBefore.add(quoteProtocolFee)
    );
    expect(wethBalanceDittoPoolAfter).to.equal(
      initialTokenBalance.add(amountPayment).sub(quoteProtocolFee)
    );
  });

  it("Sell an NFT for native unwrapped ether", async () => {
    const wethBalanceTraderInitial = await weth.balanceOf(trader.address);
    expect(wethBalanceTraderInitial).to.equal(ethers.constants.Zero);
    const ethBalanceTraderInitial = await trader.getBalance();
    expect(ethBalanceTraderInitial).to.equal(parseEther("10000"));
    const wethBalanceDittoPoolBefore = await weth.balanceOf(dittoPool.address);
    expect(wethBalanceDittoPoolBefore).to.equal(initialTokenBalance);

    const tokenId03 = 130019123456789; // probably not minted yet
    await nft.connect(trader).mint(trader.address, tokenId03);
    const tokenId03Owner = await nft.ownerOf(tokenId03);
    expect(tokenId03Owner).to.eq(trader.address);
    await nft.connect(trader).setApprovalForAll(dittoModule.address, true);

    const sellQuote = await dittoPool.getSellNftQuote(1, "0x");
    const outputValue = sellQuote[3];
    const nftCostData = sellQuote[4];
    let quoteProtocolFee = ethers.BigNumber.from(0);
    for (const costData of nftCostData) {
      quoteProtocolFee = quoteProtocolFee.add(costData.fee.protocol);
    }
    const fee = [poolAddress, 0];

    const dittoOrderParams = {
      tokenSender: trader.address,
      nftIds: [tokenId03],
      swapData: "0x",
    };

    const offerParams = {
      fillTo: swapModule.address,
      refundTo: trader.address,
      revertIfIncomplete: true,
    };

    const sell = [
      poolAddress,
      dittoOrderParams,
      [marketMakerLpId.toString()],
      "0x",
      outputValue,
      offerParams,
      [fee],
    ];

    const data = dittoModule.interface.encodeFunctionData("sell", sell);
    const swapExecution = [dittoModule.address, data, 0];

    const unWrapInfo = await generateSwapInfo(
      chainId,
      ethers.getDefaultProvider(),
      "",
      weth.address,
      Sdk.Common.Addresses.Native[chainId],
      outputValue,
      {
        module: swapModule,
        transfers: [
          {
            toETH: true,
            recipient: trader.address,
            amount: outputValue,
          },
        ],
        refundTo: trader.address,
        revertIfIncomplete: true,
      }
    );

    const traderBalanceBeforeTrade = await trader.getBalance();
    const executionPath = [swapExecution, unWrapInfo.execution];
    const routerExecution = await router.connect(trader).execute(executionPath);
    const routerExecutionReceipt = await routerExecution.wait();
    const routerExecutionGasUsed = routerExecutionReceipt.gasUsed;
    const routerExecutionGasPrice = routerExecutionReceipt.effectiveGasPrice;
    const routerExecutionGasCost = routerExecutionGasUsed.mul(routerExecutionGasPrice);

    const ethBalanceTraderAfter = await trader.getBalance();
    expect(ethBalanceTraderAfter).to.equal(
      ethers.BigNumber.from(traderBalanceBeforeTrade).add(outputValue).sub(routerExecutionGasCost)
    );
    const tokenId03OwnerAfter = await nft.ownerOf(tokenId03);
    expect(tokenId03OwnerAfter).to.eq(dittoPool.address);
    const wethBalanceDittoPoolAfter = await weth.balanceOf(dittoPool.address);
    expect(wethBalanceDittoPoolAfter).to.equal(
      wethBalanceDittoPoolBefore.sub(outputValue.add(quoteProtocolFee))
    );
  });
});
