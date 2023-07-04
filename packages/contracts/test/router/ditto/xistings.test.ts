import { Contract } from "@ethersproject/contracts";
import { parseEther } from "@ethersproject/units";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { ethers } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { expect } from "chai";

//import { setupDittoListings } from "../helpers/ditto";
import * as Sdk from "../../../../sdk/src";
import abiErc20 from "../../../../sdk/src/ditto/abis/Erc20.json";
import abiErc721 from "../../../../sdk/src/ditto/abis/Erc721.json";

describe("DittoPoolFactory", () => {

  let token: Contract;
  let initialTokenBalance: BigNumber;
  let impersonatedSigner: SignerWithAddress;
 
  let deployer: SignerWithAddress;
 
  let tokenAddress: string;
  let dittoPoolLinAddress: string;

  beforeEach(async () => {


    //await setupDittoListings(listings);


  });

  let tokenId: any;
  let nft: Contract;
  let dittoPool: Contract;

  let router: Contract;
  let xDittoModule: Contract;



  it("accept listing", async () => {

    const chainId = 5; //TODO: getChainId() after mainnet deploy

    [deployer] = await ethers.getSigners();

    initialTokenBalance = parseEther("1000");

  
    dittoPoolLinAddress = "0x2f4776214A9741F3E97E3CB4C0D9Fd75B4777687"; //DittoPoolLin
    impersonatedSigner = await ethers.getImpersonatedSigner("0x0C19069F36594D93Adfa5794546A8D6A9C1b9e23"); //M1

    tokenId = 1;
  
    const nft: Contract = new Contract(
        Sdk.Ditto.Addresses.Test721[chainId],
        abiErc721,
        ethers.provider 
      );

    await nft.ownerOf(tokenId).then((owner: any) => {
        expect(owner).to.eq(dittoPoolLinAddress);
    });

    token = new Contract(
        Sdk.Ditto.Addresses.Test20[chainId],
        abiErc20,
        ethers.provider 
    );

    
    let balance00: BigNumber = await token.balanceOf(impersonatedSigner.address);
    await token.connect(impersonatedSigner).mint(impersonatedSigner.address, initialTokenBalance);
    await token.balanceOf(impersonatedSigner.address).then((balance01: BigNumber) => {
        expect(balance01).to.equal(balance00.add(initialTokenBalance));
        
    });
   

    const dittoPoolLinAbi = '[{"inputs":[],"name":"DittoPoolMainAlreadyInitialized","type":"error"},{"inputs":[],"name":"DittoPoolMainInvalidAdminFeeRecipient","type":"error"},{"inputs":[{"internalType":"uint128","name":"basePrice","type":"uint128"}],"name":"DittoPoolMainInvalidBasePrice","type":"error"},{"inputs":[{"internalType":"uint128","name":"delta","type":"uint128"}],"name":"DittoPoolMainInvalidDelta","type":"error"},{"inputs":[],"name":"DittoPoolMainInvalidFee","type":"error"},{"inputs":[],"name":"DittoPoolMainInvalidMsgSender","type":"error"},{"inputs":[],"name":"DittoPoolMainInvalidOwnerOperation","type":"error"},{"inputs":[],"name":"DittoPoolMainInvalidPermitterData","type":"error"},{"inputs":[],"name":"DittoPoolMainNoDirectNftTransfers","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeInsufficientBalance","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeInvalidNftTokenId","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeMustDepositLiquidity","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeNotAuthorizedForLpId","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeOneLpPerPrivatePool","type":"error"},{"inputs":[],"name":"DittoPoolMarketMakeWrongPoolForLpId","type":"error"},{"inputs":[{"internalType":"enum CurveErrorCode","name":"error","type":"uint8"}],"name":"DittoPoolTradeBondingCurveError","type":"error"},{"inputs":[],"name":"DittoPoolTradeInTooManyTokens","type":"error"},{"inputs":[],"name":"DittoPoolTradeInsufficientBalanceToBuyNft","type":"error"},{"inputs":[],"name":"DittoPoolTradeInsufficientBalanceToPayFees","type":"error"},{"inputs":[],"name":"DittoPoolTradeInvalidTokenRecipient","type":"error"},{"inputs":[],"name":"DittoPoolTradeInvalidTokenSender","type":"error"},{"inputs":[],"name":"DittoPoolTradeNftAndCostDataLengthMismatch","type":"error"},{"inputs":[],"name":"DittoPoolTradeNftAndLpIdsMustBeSameLength","type":"error"},{"inputs":[],"name":"DittoPoolTradeNftIdDoesNotMatchSwapData","type":"error"},{"inputs":[{"internalType":"uint256","name":"nftId","type":"uint256"}],"name":"DittoPoolTradeNftNotOwnedByPool","type":"error"},{"inputs":[],"name":"DittoPoolTradeNoNftsProvided","type":"error"},{"inputs":[],"name":"DittoPoolTradeOutTooFewTokens","type":"error"},{"inputs":[],"name":"OwnerTwoStepNotOwner","type":"error"},{"inputs":[],"name":"OwnerTwoStepNotPendingOwner","type":"error"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newAdminFee","type":"uint256"}],"name":"DittoPoolMainAdminChangedAdminFee","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"adminFeeRecipient","type":"address"}],"name":"DittoPoolMainAdminChangedAdminFeeRecipient","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint128","name":"newBasePrice","type":"uint128"}],"name":"DittoPoolMainAdminChangedBasePrice","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint128","name":"newDelta","type":"uint128"}],"name":"DittoPoolMainAdminChangedDelta","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"newLpFee","type":"uint256"}],"name":"DittoPoolMainAdminChangedLpFee","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"template","type":"address"},{"indexed":false,"internalType":"address","name":"lpNft","type":"address"},{"indexed":false,"internalType":"address","name":"permitter","type":"address"}],"name":"DittoPoolMainPoolInitialized","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"liquidityProvider","type":"address"},{"indexed":false,"internalType":"uint256","name":"lpId","type":"uint256"},{"indexed":false,"internalType":"uint256[]","name":"tokenIds","type":"uint256[]"},{"indexed":false,"internalType":"uint256","name":"tokenDepositAmount","type":"uint256"},{"indexed":false,"internalType":"bytes","name":"referrer","type":"bytes"}],"name":"DittoPoolMarketMakeLiquidityAdded","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"lpId","type":"uint256"},{"indexed":false,"internalType":"uint256[]","name":"nftIds","type":"uint256[]"},{"indexed":false,"internalType":"uint256","name":"tokenWithdrawAmount","type":"uint256"}],"name":"DittoPoolMarketMakeLiquidityRemoved","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"buyerLpId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"nftId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"price","type":"uint256"},{"components":[{"internalType":"uint256","name":"lp","type":"uint256"},{"internalType":"uint256","name":"admin","type":"uint256"},{"internalType":"uint256","name":"protocol","type":"uint256"}],"indexed":false,"internalType":"struct Fee","name":"fee","type":"tuple"}],"name":"DittoPoolTradeSwappedNftForTokens","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"caller","type":"address"},{"components":[{"internalType":"uint256[]","name":"nftIds","type":"uint256[]"},{"internalType":"uint256[]","name":"lpIds","type":"uint256[]"},{"internalType":"uint256","name":"minExpectedTokenOutput","type":"uint256"},{"internalType":"address","name":"nftSender","type":"address"},{"internalType":"address","name":"tokenRecipient","type":"address"},{"internalType":"bytes","name":"permitterData","type":"bytes"},{"internalType":"bytes","name":"swapData","type":"bytes"}],"indexed":false,"internalType":"struct SwapNftsForTokensArgs","name":"args","type":"tuple"},{"indexed":false,"internalType":"uint128","name":"newBasePrice","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"newDelta","type":"uint128"}],"name":"DittoPoolTradeSwappedNftsForTokens","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint256","name":"sellerLpId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"nftId","type":"uint256"},{"indexed":false,"internalType":"uint256","name":"price","type":"uint256"},{"components":[{"internalType":"uint256","name":"lp","type":"uint256"},{"internalType":"uint256","name":"admin","type":"uint256"},{"internalType":"uint256","name":"protocol","type":"uint256"}],"indexed":false,"internalType":"struct Fee","name":"fee","type":"tuple"}],"name":"DittoPoolTradeSwappedTokensForNft","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"caller","type":"address"},{"components":[{"internalType":"uint256[]","name":"nftIds","type":"uint256[]"},{"internalType":"uint256","name":"maxExpectedTokenInput","type":"uint256"},{"internalType":"address","name":"tokenSender","type":"address"},{"internalType":"address","name":"nftRecipient","type":"address"},{"internalType":"bytes","name":"swapData","type":"bytes"}],"indexed":false,"internalType":"struct SwapTokensForNftsArgs","name":"args","type":"tuple"},{"indexed":false,"internalType":"uint128","name":"newBasePrice","type":"uint128"},{"indexed":false,"internalType":"uint128","name":"newDelta","type":"uint128"}],"name":"DittoPoolTradeSwappedTokensForNfts","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"previousOwner","type":"address"}],"name":"OwnerTwoStepOwnerRenouncedOwnership","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"currentOwner","type":"address"},{"indexed":false,"internalType":"address","name":"newPendingOwner","type":"address"}],"name":"OwnerTwoStepOwnerStartedTransfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":false,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnerTwoStepOwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnerTwoStepPendingOwnerAcceptedTransfer","type":"event"},{"inputs":[],"name":"_privatePoolOwnerLpId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"acceptOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint256","name":"lpId_","type":"uint256"},{"internalType":"uint256[]","name":"nftIdList_","type":"uint256[]"},{"internalType":"uint256","name":"tokenDepositAmount_","type":"uint256"},{"internalType":"bytes","name":"permitterData_","type":"bytes"},{"internalType":"bytes","name":"referrer_","type":"bytes"}],"name":"addLiquidity","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"adminFee","outputs":[{"internalType":"uint96","name":"feeAdmin_","type":"uint96"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"adminFeeRecipient","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"basePrice","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"bondingCurve","outputs":[{"internalType":"string","name":"curve","type":"string"}],"stateMutability":"pure","type":"function"},{"inputs":[{"internalType":"uint96","name":"newFeeAdmin_","type":"uint96"}],"name":"changeAdminFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newAdminFeeRecipient_","type":"address"}],"name":"changeAdminFeeRecipient","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint128","name":"newBasePrice_","type":"uint128"}],"name":"changeBasePrice","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint128","name":"newDelta_","type":"uint128"}],"name":"changeDelta","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint96","name":"newFeeLp_","type":"uint96"}],"name":"changeLpFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"lpRecipient_","type":"address"},{"internalType":"uint256[]","name":"nftIdList_","type":"uint256[]"},{"internalType":"uint256","name":"tokenDepositAmount_","type":"uint256"},{"internalType":"bytes","name":"permitterData_","type":"bytes"},{"internalType":"bytes","name":"referrer_","type":"bytes"}],"name":"createLiquidity","outputs":[{"internalType":"uint256","name":"lpId","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"delta","outputs":[{"internalType":"uint128","name":"","type":"uint128"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"dittoPoolFactory","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"fee","outputs":[{"internalType":"uint256","name":"fee_","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getAllLpIdTokenBalances","outputs":[{"components":[{"internalType":"uint256","name":"lpId","type":"uint256"},{"internalType":"uint256","name":"tokenBalance","type":"uint256"}],"internalType":"struct LpIdToTokenBalance[]","name":"balances","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getAllPoolHeldNftIds","outputs":[{"internalType":"uint256[]","name":"","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getAllPoolLpIds","outputs":[{"internalType":"uint256[]","name":"lpIds","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"numNfts_","type":"uint256"},{"internalType":"bytes","name":"swapData_","type":"bytes"}],"name":"getBuyNftQuote","outputs":[{"internalType":"enum CurveErrorCode","name":"error","type":"uint8"},{"internalType":"uint256","name":"newBasePrice","type":"uint256"},{"internalType":"uint256","name":"newDelta","type":"uint256"},{"internalType":"uint256","name":"inputAmount","type":"uint256"},{"components":[{"internalType":"bool","name":"specificNftId","type":"bool"},{"internalType":"uint256","name":"nftId","type":"uint256"},{"internalType":"uint256","name":"price","type":"uint256"},{"components":[{"internalType":"uint256","name":"lp","type":"uint256"},{"internalType":"uint256","name":"admin","type":"uint256"},{"internalType":"uint256","name":"protocol","type":"uint256"}],"internalType":"struct Fee","name":"fee","type":"tuple"}],"internalType":"struct NftCostData[]","name":"nftCostData","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"nftId_","type":"uint256"}],"name":"getLpIdForNftId","outputs":[{"internalType":"uint256","name":"lpId","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getLpNft","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"lpId_","type":"uint256"}],"name":"getNftCountForLpId","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"lpId_","type":"uint256"}],"name":"getNftIdsForLpId","outputs":[{"internalType":"uint256[]","name":"nftIds","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getPoolTotalNftBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"getPoolTotalTokenBalance","outputs":[{"internalType":"uint256","name":"totalTokenBalance","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"numNfts_","type":"uint256"},{"internalType":"bytes","name":"swapData_","type":"bytes"}],"name":"getSellNftQuote","outputs":[{"internalType":"enum CurveErrorCode","name":"error","type":"uint8"},{"internalType":"uint256","name":"newBasePrice","type":"uint256"},{"internalType":"uint256","name":"newDelta","type":"uint256"},{"internalType":"uint256","name":"outputAmount","type":"uint256"},{"components":[{"internalType":"bool","name":"specificNftId","type":"bool"},{"internalType":"uint256","name":"nftId","type":"uint256"},{"internalType":"uint256","name":"price","type":"uint256"},{"components":[{"internalType":"uint256","name":"lp","type":"uint256"},{"internalType":"uint256","name":"admin","type":"uint256"},{"internalType":"uint256","name":"protocol","type":"uint256"}],"internalType":"struct Fee","name":"fee","type":"tuple"}],"internalType":"struct NftCostData[]","name":"nftCostData","type":"tuple[]"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"lpId_","type":"uint256"}],"name":"getTokenBalanceForLpId","outputs":[{"internalType":"uint256","name":"tokenBalance","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"lpId_","type":"uint256"}],"name":"getTotalBalanceForLpId","outputs":[{"internalType":"uint256","name":"tokenBalance","type":"uint256"},{"internalType":"uint256","name":"nftBalance","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"components":[{"internalType":"bool","name":"isPrivatePool","type":"bool"},{"internalType":"uint256","name":"templateIndex","type":"uint256"},{"internalType":"address","name":"token","type":"address"},{"internalType":"address","name":"nft","type":"address"},{"internalType":"uint96","name":"feeLp","type":"uint96"},{"internalType":"address","name":"owner","type":"address"},{"internalType":"uint96","name":"feeAdmin","type":"uint96"},{"internalType":"uint128","name":"delta","type":"uint128"},{"internalType":"uint128","name":"basePrice","type":"uint128"},{"internalType":"uint256[]","name":"nftIdList","type":"uint256[]"},{"internalType":"uint256","name":"initialTokenBalance","type":"uint256"},{"internalType":"bytes","name":"templateInitData","type":"bytes"},{"internalType":"bytes","name":"referrer","type":"bytes"}],"internalType":"struct PoolTemplate","name":"params_","type":"tuple"},{"internalType":"address","name":"template_","type":"address"},{"internalType":"contract LpNft","name":"lpNft_","type":"address"},{"internalType":"contract IPermitter","name":"permitter_","type":"address"}],"name":"initPool","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"initialized","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"isPrivatePool","outputs":[{"internalType":"bool","name":"isPrivatePool_","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"lpFee","outputs":[{"internalType":"uint96","name":"feeLp_","type":"uint96"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"nft","outputs":[{"internalType":"contract IERC721","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"","type":"address"},{"internalType":"address","name":"","type":"address"},{"internalType":"uint256","name":"","type":"uint256"},{"internalType":"bytes","name":"","type":"bytes"}],"name":"onERC721Received","outputs":[{"internalType":"bytes4","name":"","type":"bytes4"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pendingOwner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"permitter","outputs":[{"internalType":"contract IPermitter","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"protocolFee","outputs":[{"internalType":"uint256","name":"feeProtocol_","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"withdrawalAddress_","type":"address"},{"internalType":"uint256","name":"lpId_","type":"uint256"},{"internalType":"uint256[]","name":"nftIdList_","type":"uint256[]"},{"internalType":"uint256","name":"tokenWithdrawAmount_","type":"uint256"}],"name":"pullLiquidity","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"uint256[]","name":"nftIds","type":"uint256[]"},{"internalType":"uint256[]","name":"lpIds","type":"uint256[]"},{"internalType":"uint256","name":"minExpectedTokenOutput","type":"uint256"},{"internalType":"address","name":"nftSender","type":"address"},{"internalType":"address","name":"tokenRecipient","type":"address"},{"internalType":"bytes","name":"permitterData","type":"bytes"},{"internalType":"bytes","name":"swapData","type":"bytes"}],"internalType":"struct SwapNftsForTokensArgs","name":"args_","type":"tuple"}],"name":"swapNftsForTokens","outputs":[{"internalType":"uint256","name":"outputAmount","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"uint256[]","name":"nftIds","type":"uint256[]"},{"internalType":"uint256","name":"maxExpectedTokenInput","type":"uint256"},{"internalType":"address","name":"tokenSender","type":"address"},{"internalType":"address","name":"nftRecipient","type":"address"},{"internalType":"bytes","name":"swapData","type":"bytes"}],"internalType":"struct SwapTokensForNftsArgs","name":"args_","type":"tuple"}],"name":"swapTokensForNfts","outputs":[{"internalType":"uint256","name":"inputAmount","type":"uint256"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"template","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"token","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"newPendingOwner_","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}]';
    dittoPool = new Contract(
        dittoPoolLinAddress,
        dittoPoolLinAbi,
        ethers.provider 
    );

  



    router = await ethers
    .getContractFactory("ReservoirV6_0_1", deployer)
    .then((factory) => factory.deploy());

    xDittoModule = await ethers
    .getContractFactory("DittoModule", deployer)
    .then((factory) =>
      factory.deploy(deployer.address, router.address)
    );


    
   

    const eRC20ListingParams = [
      impersonatedSigner.address, //address fillTo;
      impersonatedSigner.address, //address refundTo;
        false, //bool revertIfIncomplete;
        // The ERC20 payment token for the listings
        token.address, //"0x8cAa8de40048C4c840014BdEc44373548b61568d", //token.address, //IERC20 token;
        // The total amount of `token` to be provided when filling
        parseEther("2") //uint256 amount;
    ];
    
    const fee = [
      dittoPool.address, //address recipient;
        parseEther("0.0") //uint256 amount;
    ];

    
    const buyWithERC20 = [
        [dittoPool.address], //IDittoPool[] calldata pairs, (pair)...
        [tokenId], //uint256[] calldata nftIds,
        eRC20ListingParams, //ERC20ListingParams calldata params,
        [fee] //Fee[] calldata fees
    ];

    //xDittoModule
    let data = xDittoModule.interface.encodeFunctionData("buyWithERC20", buyWithERC20);

    const executions = [
          xDittoModule.address, //module: 
          data, //data: 
          0 //parseEther("5") //value: 
    ];
    
    console.log("             xDittoModule.address: ", xDittoModule.address);


    await token.connect(deployer).approve(xDittoModule.address, initialTokenBalance);
  




const dpf: Contract = new Contract(
  "0xF7cd2CD77eEbC441ac31F17d52006Dc1De0eF538",
  '[{"inputs":[{"internalType":"address","name":"metadataGenerator_","type":"address"},{"internalType":"address","name":"feeProtocolRecipient_","type":"address"},{"internalType":"uint96","name":"feeProtocol_","type":"uint96"},{"internalType":"address[]","name":"poolTemplates_","type":"address[]"},{"internalType":"contract IPoolManager[]","name":"poolManagerTemplates_","type":"address[]"},{"internalType":"contract IPermitter[]","name":"permitterTemplates_","type":"address[]"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[],"name":"DittoPoolFactoryInvalidProtocolFee","type":"error"},{"inputs":[{"internalType":"uint256","name":"templateIndex","type":"uint256"}],"name":"DittoPoolFactoryInvalidTemplateIndex","type":"error"},{"inputs":[],"name":"ERC1167FailedCreateClone","type":"error"},{"inputs":[],"name":"OwnerTwoStepNotOwner","type":"error"},{"inputs":[],"name":"OwnerTwoStepNotPendingOwner","type":"error"},{"inputs":[],"name":"ReentrancyGuardReentrantCall","type":"error"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"permitterTemplate","type":"address"}],"name":"DittoPoolFactoryAdminAddedPermitterTemplate","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"poolManagerTemplate","type":"address"}],"name":"DittoPoolFactoryAdminAddedPoolManagerTemplate","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"poolTemplate","type":"address"}],"name":"DittoPoolFactoryAdminAddedPoolTemplate","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"router","type":"address"}],"name":"DittoPoolFactoryAdminAddedRouter","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"uint96","name":"protocolFeeMultiplier","type":"uint96"}],"name":"DittoPoolFactoryAdminSetProtocolFeeMultiplier","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"protocolFeeRecipient","type":"address"}],"name":"DittoPoolFactoryAdminSetProtocolFeeRecipient","type":"event"},{"anonymous":false,"inputs":[{"components":[{"internalType":"bool","name":"isPrivatePool","type":"bool"},{"internalType":"uint256","name":"templateIndex","type":"uint256"},{"internalType":"address","name":"token","type":"address"},{"internalType":"address","name":"nft","type":"address"},{"internalType":"uint96","name":"feeLp","type":"uint96"},{"internalType":"address","name":"owner","type":"address"},{"internalType":"uint96","name":"feeAdmin","type":"uint96"},{"internalType":"uint128","name":"delta","type":"uint128"},{"internalType":"uint128","name":"basePrice","type":"uint128"},{"internalType":"uint256[]","name":"nftIdList","type":"uint256[]"},{"internalType":"uint256","name":"initialTokenBalance","type":"uint256"},{"internalType":"bytes","name":"templateInitData","type":"bytes"},{"internalType":"bytes","name":"referrer","type":"bytes"}],"indexed":false,"internalType":"struct PoolTemplate","name":"poolTemplate","type":"tuple"},{"indexed":false,"internalType":"address","name":"dittoPool","type":"address"},{"components":[{"internalType":"uint256","name":"templateIndex","type":"uint256"},{"internalType":"bytes","name":"templateInitData","type":"bytes"}],"indexed":false,"internalType":"struct PoolManagerTemplate","name":"poolManagerTemplate","type":"tuple"},{"indexed":false,"internalType":"address","name":"poolManager","type":"address"},{"components":[{"internalType":"uint256","name":"templateIndex","type":"uint256"},{"internalType":"bytes","name":"templateInitData","type":"bytes"},{"internalType":"bytes","name":"liquidityDepositPermissionData","type":"bytes"}],"indexed":false,"internalType":"struct PermitterTemplate","name":"permitterTemplate","type":"tuple"},{"indexed":false,"internalType":"address","name":"permitter","type":"address"},{"indexed":false,"internalType":"bool","name":"permitterInitiallyLocked","type":"bool"},{"indexed":false,"internalType":"bytes","name":"permitterInitData","type":"bytes"}],"name":"DittoPoolFactoryDittoPoolCreated","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"previousOwner","type":"address"}],"name":"OwnerTwoStepOwnerRenouncedOwnership","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"currentOwner","type":"address"},{"indexed":false,"internalType":"address","name":"newPendingOwner","type":"address"}],"name":"OwnerTwoStepOwnerStartedTransfer","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":false,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnerTwoStepOwnershipTransferred","type":"event"},{"anonymous":false,"inputs":[{"indexed":false,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnerTwoStepPendingOwnerAcceptedTransfer","type":"event"},{"inputs":[],"name":"acceptOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IPermitter[]","name":"permitterTemplates_","type":"address[]"}],"name":"addPermitterTemplates","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IPoolManager[]","name":"poolManagerTemplates_","type":"address[]"}],"name":"addPoolManagerTemplates","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address[]","name":"poolTemplates_","type":"address[]"}],"name":"addPoolTemplates","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IDittoRouter[]","name":"routers_","type":"address[]"}],"name":"addRouters","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"components":[{"internalType":"bool","name":"isPrivatePool","type":"bool"},{"internalType":"uint256","name":"templateIndex","type":"uint256"},{"internalType":"address","name":"token","type":"address"},{"internalType":"address","name":"nft","type":"address"},{"internalType":"uint96","name":"feeLp","type":"uint96"},{"internalType":"address","name":"owner","type":"address"},{"internalType":"uint96","name":"feeAdmin","type":"uint96"},{"internalType":"uint128","name":"delta","type":"uint128"},{"internalType":"uint128","name":"basePrice","type":"uint128"},{"internalType":"uint256[]","name":"nftIdList","type":"uint256[]"},{"internalType":"uint256","name":"initialTokenBalance","type":"uint256"},{"internalType":"bytes","name":"templateInitData","type":"bytes"},{"internalType":"bytes","name":"referrer","type":"bytes"}],"internalType":"struct PoolTemplate","name":"poolTemplate_","type":"tuple"},{"components":[{"internalType":"uint256","name":"templateIndex","type":"uint256"},{"internalType":"bytes","name":"templateInitData","type":"bytes"}],"internalType":"struct PoolManagerTemplate","name":"poolManagerTemplate_","type":"tuple"},{"components":[{"internalType":"uint256","name":"templateIndex","type":"uint256"},{"internalType":"bytes","name":"templateInitData","type":"bytes"},{"internalType":"bytes","name":"liquidityDepositPermissionData","type":"bytes"}],"internalType":"struct PermitterTemplate","name":"permitterTemplate_","type":"tuple"}],"name":"createDittoPool","outputs":[{"internalType":"contract IDittoPool","name":"dittoPool","type":"address"},{"internalType":"uint256","name":"lpId","type":"uint256"},{"internalType":"contract IPoolManager","name":"poolManager","type":"address"},{"internalType":"contract IPermitter","name":"permitter","type":"address"}],"stateMutability":"nonpayable","type":"function"},{"inputs":[],"name":"getProtocolFee","outputs":[{"internalType":"uint96","name":"","type":"uint96"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"address","name":"router_","type":"address"}],"name":"isWhitelistedRouter","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"lpNft","outputs":[{"internalType":"contract LpNft","name":"lpNft_","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"pendingOwner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"permitterTemplates","outputs":[{"internalType":"contract IPermitter[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"poolManagerTemplates","outputs":[{"internalType":"contract IPoolManager[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"poolTemplates","outputs":[{"internalType":"address[]","name":"","type":"address[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"protocolFeeRecipient","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"contract IMetadataGenerator","name":"metadataGenerator_","type":"address"}],"name":"setMetadataGenerator","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"uint96","name":"feeProtocol_","type":"uint96"}],"name":"setProtocolFee","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"feeProtocolRecipient_","type":"address"}],"name":"setProtocolFeeRecipient","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"address","name":"newPendingOwner_","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}]',
  ethers.provider 
);

const owner: SignerWithAddress = await ethers.getImpersonatedSigner("0x15aedf98CD01427440232a9B90d091A7782eCF9c");
await dpf.connect(owner).addRouters([xDittoModule.address]);

    let xxx = await token.connect(impersonatedSigner).approve(xDittoModule.address, initialTokenBalance);
    await xxx.wait();

    await token.connect(impersonatedSigner).allowance(impersonatedSigner.address, xDittoModule.address).then((allowance: any) => {
      console.log("             xxxallowance: ", allowance);
    });

    

    let xxxxxxx = await token.connect(impersonatedSigner).allowance(impersonatedSigner.address, "0x9c23eb4e6a9490af77a5cb1f3d2ba579ad17b1fc");

    console.log("             xxxxxxx: ", xxxxxxx);

    await router.connect(impersonatedSigner).execute([executions]);


    await nft.ownerOf(tokenId).then((owner: any) => {
        console.log("             owner: ", owner);
        console.log("impersonatedSigner: ", impersonatedSigner.address);
        console.log(" dittoPool.address: ", dittoPool.address);
        console.log("  deployer.address: ", deployer.address);
    });


  });




});
