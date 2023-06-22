import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import * as Sdk from "@reservoir0x/sdk/src";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";

import { ExecutionInfo } from "../helpers/router";

import { setupDittoPool } from "../helpers/ditto";

import {
  bn,
  getRandomBoolean,
  getRandomFloat,
  getRandomInteger,
  setupNFTs,
  setupTokens,
} from "../../utils";

//ALCHEMY_KEY="" BLOCK_NUMBER="9212320" npx hardhat test test/router/ditto/simple.1.test.ts
describe("DittoPoolFactory", () => {



  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;

  let erc20: Contract;
  let erc721: Contract;
 

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

  });

  let router: Contract;

  it("example method", async () => {

    router = await ethers
    .getContractFactory("ReservoirV6_0_1", deployer)
    .then((factory) => factory.deploy());

    const tokenAddress = "0x8cAa8de40048C4c840014BdEc44373548b61568d";
    const tokenAbi = '[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"spender","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":false,"internalType":"uint256","name":"amount","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[],"name":"DOMAIN_SEPARATOR","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"PERMIT_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"}],"name":"allowance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"approve","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"burn","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"decimals","outputs":[{"internalType":"uint8","name":"","type":"uint8"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"mint","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"}],"name":"nonces","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"spender","type":"address"},{"internalType":"uint256","name":"value","type":"uint256"},{"internalType":"uint256","name":"deadline","type":"uint256"},{"internalType":"uint8","name":"v","type":"uint8"},{"internalType":"bytes32","name":"r","type":"bytes32"},{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"permit","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transfer","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"amount","type":"uint256"}],"name":"transferFrom","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"nonpayable","type":"function"}]';

    const token = new Contract(
        tokenAddress,
        tokenAbi,
        ethers.provider 
    );

    const initialTokenBalance = parseEther("10");

    await token.connect(deployer).mint(deployer.address, initialTokenBalance);
    await token.balanceOf(deployer.address).then((balance: any) => {
      console.log("balance: ", balance.toString());
    });


    const dittoPoolLinAddress = "0xE58bE749c807b86EEdf31d1762314F501A26F763";
    const dittoPoolLinAbi = '[{"inputs":[],"name":"DittoPoolMainAlreadyInitialized","type":"error"},{"inputs":[],"name":"DittoPoolMainInvalidAdminFeeRecipient","type":"error"},{"inputs":[{"internalType":"uint128","name":"basePrice","type":"uint128"}],"name":"DittoPoolMainInvalidBasePrice","type":"error"},{"inputs":[{"internalType":"uint128","name":"delta","type":"uint128"}],"name":"DittoPoolMainInvalidDelta","type":"error"},{"inputs":[],"name":"DittoPoolMainInvalidFee","type":"error"},{"inputs":[],"name":"DittoPoolMainInvalidMsgSender","type":"error"},{"inputs":[],"name":"DittoPoolMainInvalidOwnerOperation","type":"error"},{"inputs":[],"name":"DittoPoolMainInvalidPermitterData","type":"error"},{"inputs":[],"name":"DittoPoolMainNoDirectNftTransfers","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeInsufficientBalance","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeInvalidNftTokenId","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeMustDepositLiquidity","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeNotAuthorizedForLpId","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeOneLpPerPrivatePool","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeWrongPoolForLpId","type":"error"},{"inputs":[{"internalType":"enum CurveErrorCode","name":"error","type":"uint8"}],"name":"DittoPoolTradeBondingCurveError","type":"error"},{"inputs":[],"name":"DittoPoolTradeInTooManyTokens","type":"error"},{"inputs":[],"name":"DittoPoolTradeInsufficientBalanceToBuyNft","type":"error"},{"inputs":[],"name":"DittoPoolTradeInsufficientBalanceToPayFees","type":"error"},{"inputs":[],"name":"DittoPoolTradeInvalidTokenRecipient","type":"error"},{"inputs":[],"name":"DittoPoolTradeInvalidTokenSender","type":"error"},{"inputs":[],"name":"DittoPoolTradeNftAndCostDataLengthMismatch","type":"error"},{"inputs":[],"name":"DittoPoolTradeNftAndLpIdsMustBeSameLength","type":"error"},{"inputs":[],"name":"DittoPoolTradeNftIdDoesNotMatchSwapData","type":"error"},{"inputs":[{"internalType":"uint256","name":"nftId","type":"uint256"}],"name":"DittoPoolTradeNftNotOwnedByPool","type":"error"},{"inputs":[],"name":"DittoPoolTradeNoNftsProvided","type":"error"},{"inputs":[],"name":"DittoPoolTradeOutTooFewTokens","type":"error"},{"inputs":[],"name":"OwnerTwoStepNotOwner","type":"error"},{"inputs":[],"name":"OwnerTwoStepNotPendingOwner","type":"error"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newAdminFee","type":"uint256"}],"name":"DittoPoolMainAdminChangedAdminFee","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"adminFeeRecipient","type":"address"}],"name":"DittoPoolMainAdminChangedAdminFeeRecipient","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint128","name":"newBasePrice","type":"uint128"}],"name":"DittoPoolMainAdminChangedBasePrice","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint128","name":"newDelta","type":"uint128"}],"name":"DittoPoolMainAdminChangedDelta","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newLpFee","type":"uint256"}],"name":"DittoPoolMainAdminChangedLpFee","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"template","type":"address"},{"indexed":false,"internalType":"address","name":"lpNft","type":"address"},{"indexed":false,"internalType":"address","name":"permitter","type":"address"}],"name":"DittoPoolMainPoolInitialized","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"liquidityProvider","type":"address"},{"indexed":false,"internalType":"uint256","name":"lpId","type":"uint256"},{"indexed":false,"internalType":"uint256[]","name":"tokenIds","type":"uint256[]"},{"indexed":false,"internalType":"uint256","name":"tokenDepositAmount","type":"uint256"},{"indexed":false,"internalType":"bytes","name":"referrer","type":"bytes"}],"name":"DittoPoolMarketMakeLiquidityAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"lpId","type":"uint256"},{"indexed":false,"internalType":"uint256[]","name":"nftIds","type":"uint256[]"},{"indexed":false,"internalType":"uint256","name":"tokenWithdrawAmount","type":"uint256"}],"name":"DittoPoolMarketMakeLiquidityRemoved","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"buyerLpId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"nftId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"price","type":"uint256"},{"components":[{"internalType":"uint256","name":"lp","type":"uint256"},{"internalType":"uint256","name":"admin","type":"uint256"},{"internalType":"uint256","name":"protocol","type":"uint256"}],"indexed":false,"internalType":"struct Fee","name":"fee","type":"tuple"}],"name":"DittoPoolTradeSwappedNftForTokens","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"caller","type":"address"},{"components":[{"internalType":"uint256[]","name":"nftIds","type":"uint256[]"},{"internalType":"uint256[]","name":"lpIds","type":"uint256[]"},{"internalType":"uint256","name":"minExpectedTokenOutput","type":"uint256"},{"internalType":"address","name":"nftSender","type":"address"},{"internalType":"address","name":"tokenRecipient","type":"address"},{"internalType":"bytes","name":"permitterData","type":"bytes"},{"internalType":"bytes","name":"swapData","type":"bytes"}],"indexed":false,"internalType":"struct SwapNftsForTokensArgs","name":"args","type":"tuple"},{"indexed":false,"internalType":"uint128","name":"newBasePrice","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"newDelta","type":"uint128"}],"name":"DittoPoolTradeSwappedNftsForTokens","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"sellerLpId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"nftId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"price","type":"uint256"},{"components":[{"internalType":"uint256","name":"lp","type":"uint256"},{"internalType":"uint256","name":"admin","type":"uint256"},{"internalType":"uint256","name":"protocol","type":"uint256"}],"indexed":false,"internalType":"struct Fee","name":"fee","type":"tuple"}],"name":"DittoPoolTradeSwappedTokensForNft","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"caller","type":"address"},{"components":[{"internalType":"uint256[]","name":"nftIds","type":"uint256[]"},{"internalType":"uint256","name":"maxExpectedTokenInput","type":"uint256"},{"internalType":"address","name":"tokenSender","type":"address"},{"internalType":"address","name":"nftRecipient","type":"address"},{"internalType":"bytes","name":"swapData","type":"bytes"}],"indexed":false,"internalType":"struct SwapTokensForNftsArgs","name":"args","type":"tuple"},{"indexed":false,"internalType":"uint128","name":"newBasePrice","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"newDelta","type":"uint128"}],"name":"DittoPoolTradeSwappedTokensForNfts","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"previousOwner","type":"address"}],"name":"OwnerTwoStepOwnerRenouncedOwnership","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"currentOwner","type":"address"},{"indexed":false,"internalType":"address","name":"newPendingOwner","type":"address"}],"name":"OwnerTwoStepOwnerStartedTransfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":false,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnerTwoStepOwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnerTwoStepPendingOwnerAcceptedTransfer","type":"event"},{"inputs":[],"name":"_privatePoolOwnerLpId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"acceptOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"lpId_","type":"uint256"},{"internalType":"uint256[]","name":"nftIdList_","type":"uint256[]"},{"internalType":"uint256","name":"tokenDepositAmount_","type":"uint256"},{"internalType":"bytes","name":"permitterData_","type":"bytes"},{"internalType":"bytes","name":"referrer_","type":"bytes"}],"name":"addLiquidity","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"adminFee","outputs":[{"internalType":"uint96","name":"feeAdmin_","type":"uint96"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"adminFeeRecipient","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"basePrice","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"bondingCurve","outputs":[{"internalType":"string","name":"curve","type":"string"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint96","name":"newFeeAdmin_","type":"uint96"}],"name":"changeAdminFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newAdminFeeRecipient_","type":"address"}],"name":"changeAdminFeeRecipient","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint128","name":"newBasePrice_","type":"uint128"}],"name":"changeBasePrice","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint128","name":"newDelta_","type":"uint128"}],"name":"changeDelta","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint96","name":"newFeeLp_","type":"uint96"}],"name":"changeLpFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"lpRecipient_","type":"address"},{"internalType":"uint256[]","name":"nftIdList_","type":"uint256[]"},{"internalType":"uint256","name":"tokenDepositAmount_","type":"uint256"},{"internalType":"bytes","name":"permitterData_","type":"bytes"},{"internalType":"bytes","name":"referrer_","type":"bytes"}],"name":"createLiquidity","outputs":[{"internalType":"uint256","name":"lpId","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"delta","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"dittoPoolFactory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"fee","outputs":[{"internalType":"uint256","name":"fee_","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getAllLpIdTokenBalances","outputs":[{"components":[{"internalType":"uint256","name":"lpId","type":"uint256"},{"internalType":"uint256","name":"tokenBalance","type":"uint256"}],"internalType":"struct LpIdToTokenBalance[]","name":"balances","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getAllPoolHeldNftIds","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getAllPoolLpIds","outputs":[{"internalType":"uint256[]","name":"lpIds","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"numNfts_","type":"uint256"},{"internalType":"bytes","name":"swapData_","type":"bytes"}],"name":"getBuyNftQuote","outputs":[{"internalType":"enum CurveErrorCode","name":"error","type":"uint8"},{"internalType":"uint256","name":"newBasePrice","type":"uint256"},{"internalType":"uint256","name":"newDelta","type":"uint256"},{"internalType":"uint256","name":"inputAmount","type":"uint256"},{"components":[{"internalType":"bool","name":"specificNftId","type":"bool"},{"internalType":"uint256","name":"nftId","type":"uint256"},{"internalType":"uint256","name":"price","type":"uint256"},{"components":[{"internalType":"uint256","name":"lp","type":"uint256"},{"internalType":"uint256","name":"admin","type":"uint256"},{"internalType":"uint256","name":"protocol","type":"uint256"}],"internalType":"struct Fee","name":"fee","type":"tuple"}],"internalType":"struct NftCostData[]","name":"nftCostData","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"nftId_","type":"uint256"}],"name":"getLpIdForNftId","outputs":[{"internalType":"uint256","name":"lpId","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getLpNft","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"lpId_","type":"uint256"}],"name":"getNftCountForLpId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"lpId_","type":"uint256"}],"name":"getNftIdsForLpId","outputs":[{"internalType":"uint256[]","name":"nftIds","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getPoolTotalNftBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getPoolTotalTokenBalance","outputs":[{"internalType":"uint256","name":"totalTokenBalance","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"numNfts_","type":"uint256"},{"internalType":"bytes","name":"swapData_","type":"bytes"}],"name":"getSellNftQuote","outputs":[{"internalType":"enum CurveErrorCode","name":"error","type":"uint8"},{"internalType":"uint256","name":"newBasePrice","type":"uint256"},{"internalType":"uint256","name":"newDelta","type":"uint256"},{"internalType":"uint256","name":"outputAmount","type":"uint256"},{"components":[{"internalType":"bool","name":"specificNftId","type":"bool"},{"internalType":"uint256","name":"nftId","type":"uint256"},{"internalType":"uint256","name":"price","type":"uint256"},{"components":[{"internalType":"uint256","name":"lp","type":"uint256"},{"internalType":"uint256","name":"admin","type":"uint256"},{"internalType":"uint256","name":"protocol","type":"uint256"}],"internalType":"struct Fee","name":"fee","type":"tuple"}],"internalType":"struct NftCostData[]","name":"nftCostData","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"lpId_","type":"uint256"}],"name":"getTokenBalanceForLpId","outputs":[{"internalType":"uint256","name":"tokenBalance","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"lpId_","type":"uint256"}],"name":"getTotalBalanceForLpId","outputs":[{"internalType":"uint256","name":"tokenBalance","type":"uint256"},{"internalType":"uint256","name":"nftBalance","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"components":[{"internalType":"bool","name":"isPrivatePool","type":"bool"},{"internalType":"uint256","name":"templateIndex","type":"uint256"},{"internalType":"address","name":"token","type":"address"},{"internalType":"address","name":"nft","type":"address"},{"internalType":"uint96","name":"feeLp","type":"uint96"},{"internalType":"address","name":"owner","type":"address"},{"internalType":"uint96","name":"feeAdmin","type":"uint96"},{"internalType":"uint128","name":"delta","type":"uint128"},{"internalType":"uint128","name":"basePrice","type":"uint128"},{"internalType":"uint256[]","name":"nftIdList","type":"uint256[]"},{"internalType":"uint256","name":"initialTokenBalance","type":"uint256"},{"internalType":"bytes","name":"templateInitData","type":"bytes"},{"internalType":"bytes","name":"referrer","type":"bytes"}],"internalType":"struct PoolTemplate","name":"params_","type":"tuple"},{"internalType":"address","name":"template_","type":"address"},{"internalType":"contract LpNft","name":"lpNft_","type":"address"},{"internalType":"contract IPermitter","name":"permitter_","type":"address"}],"name":"initPool","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"initialized","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"isPrivatePool","outputs":[{"internalType":"bool","name":"isPrivatePool_","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"lpFee","outputs":[{"internalType":"uint96","name":"feeLp_","type":"uint96"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"nft","outputs":[{"internalType":"contract IERC721","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"bytes","name":"","type":"bytes"}],"name":"onERC721Received","outputs":[{"internalType":"bytes4","name":"","type":"bytes4"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pendingOwner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"permitter","outputs":[{"internalType":"contract IPermitter","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"protocolFee","outputs":[{"internalType":"uint256","name":"feeProtocol_","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"withdrawalAddress_","type":"address"},{"internalType":"uint256","name":"lpId_","type":"uint256"},{"internalType":"uint256[]","name":"nftIdList_","type":"uint256[]"},{"internalType":"uint256","name":"tokenWithdrawAmount_","type":"uint256"}],"name":"pullLiquidity","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"uint256[]","name":"nftIds","type":"uint256[]"},{"internalType":"uint256[]","name":"lpIds","type":"uint256[]"},{"internalType":"uint256","name":"minExpectedTokenOutput","type":"uint256"},{"internalType":"address","name":"nftSender","type":"address"},{"internalType":"address","name":"tokenRecipient","type":"address"},{"internalType":"bytes","name":"permitterData","type":"bytes"},{"internalType":"bytes","name":"swapData","type":"bytes"}],"internalType":"struct SwapNftsForTokensArgs","name":"args_","type":"tuple"}],"name":"swapNftsForTokens","outputs":[{"internalType":"uint256","name":"outputAmount","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"uint256[]","name":"nftIds","type":"uint256[]"},{"internalType":"uint256","name":"maxExpectedTokenInput","type":"uint256"},{"internalType":"address","name":"tokenSender","type":"address"},{"internalType":"address","name":"nftRecipient","type":"address"},{"internalType":"bytes","name":"swapData","type":"bytes"}],"internalType":"struct SwapTokensForNftsArgs","name":"args_","type":"tuple"}],"name":"swapTokensForNfts","outputs":[{"internalType":"uint256","name":"inputAmount","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"template","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"newPendingOwner_","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}]';

    const dittoPool = new Contract(
        dittoPoolLinAddress,
        dittoPoolLinAbi,
        ethers.provider 
    );






    const nftAddress = "0x0133B5f5601D0B2980ac812A1719760ba3ea53e7";
    const nftAbi = '[{"inputs":[],"stateMutability":"nonpayable","type":"constructor"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"approved","type":"address"},{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"Approval","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"owner","type":"address"},{"indexed":true,"internalType":"address","name":"operator","type":"address"},{"indexed":false,"internalType":"bool","name":"approved","type":"bool"}],"name":"ApprovalForAll","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"from","type":"address"},{"indexed":true,"internalType":"address","name":"to","type":"address"},{"indexed":true,"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"Transfer","type":"event"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"approve","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"balanceOf","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"getApproved","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"owner","type":"address"},{"internalType":"address","name":"operator","type":"address"}],"name":"isApprovedForAll","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"id","type":"uint256"}],"name":"mint","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"ownerOf","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"safeTransferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"},{"internalType":"bytes","name":"data","type":"bytes"}],"name":"safeTransferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"operator","type":"address"},{"internalType":"bool","name":"approved","type":"bool"}],"name":"setApprovalForAll","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes4","name":"interfaceId","type":"bytes4"}],"name":"supportsInterface","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"symbol","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"tokenURI","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"from","type":"address"},{"internalType":"address","name":"to","type":"address"},{"internalType":"uint256","name":"tokenId","type":"uint256"}],"name":"transferFrom","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}]';

    const nft = new Contract(
        nftAddress,
        nftAbi,
        ethers.provider 
    );

    const tokenId = 2;

    await nft.ownerOf(tokenId).then((owner: any) => {
        console.log("             owner: ", owner);
        console.log(" dittoPool.address: ", dittoPool.address);
        console.log("  deployer.address: ", deployer.address);
    });

    // uint256[] nftIds; (2, 3, 4)
    // uint256 maxExpectedTokenInput;
    // address tokenSender;
    // address nftRecipient;
    // bytes swapData;

    const swapTokensForNftsArgs: any = [
        [tokenId],
        parseEther("10"),
        deployer.address,
        deployer.address,
        new Uint8Array([])
    ];

    await token.connect(deployer).approve(dittoPool.address, initialTokenBalance);

    await dittoPool.connect(deployer).swapTokensForNfts(
        swapTokensForNftsArgs
    );

    console.log("xxxx");


    await nft.ownerOf(tokenId).then((owner: any) => {
        console.log("-            owner: ", owner);
        console.log("- deployer.address: ", deployer.address);
    });



    
  });


});
