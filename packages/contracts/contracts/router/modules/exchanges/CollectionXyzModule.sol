// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {ICollectionPool, ICollectionRouter} from "../../../interfaces/ICollectionXyz.sol";

struct CollectionXyzOrderParams {
  uint256 nftId;
  bytes32[] proof;
  bool[] proofFlags;
  bytes externalFilterContext;
}

contract CollectionXyzModule is BaseExchangeModule {
  // --- Fields ---

  ICollectionRouter public immutable COLLECTION_ROUTER;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    address collectionRouter
  ) BaseModule(owner) BaseExchangeModule(router) {
    COLLECTION_ROUTER = ICollectionRouter(collectionRouter);
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Multiple ETH listings ---

  function buyWithETH(
    ICollectionPool[] calldata pools,
    CollectionXyzOrderParams[] calldata orderParams,
    uint256 deadline,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    uint256 poolsLength = pools.length;
    ICollectionRouter.PoolSwapSpecific[] memory swapList;
    for (uint256 i; i < poolsLength; ) {
      // Build router data
      swapList = new ICollectionRouter.PoolSwapSpecific[](1);
      swapList[0] = ICollectionRouter.PoolSwapSpecific({
        pool: pools[i],
        nftIds: new uint256[](1),
        proof: orderParams[i].proof,
        proofFlags: orderParams[i].proofFlags,
        externalFilterContext: orderParams[i].externalFilterContext
      });
      swapList[0].nftIds[0] = orderParams[i].nftId;

      // Fetch the current price quote
      (, , uint256 price, ) = pools[i].getBuyNFTQuote(1);

      // Execute fill
      try
        COLLECTION_ROUTER.swapETHForSpecificNFTs{value: price}(
          swapList,
          address(this),
          params.fillTo,
          deadline
        )
      {} catch {
        if (params.revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      unchecked {
        ++i;
      }
    }
  }

  // --- Multiple ERC20 listings ---

  function buyWithERC20(
    ICollectionPool[] calldata pools,
    CollectionXyzOrderParams[] calldata orderParams,
    uint256 deadline,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    // Approve the router if needed
    _approveERC20IfNeeded(params.token, address(COLLECTION_ROUTER), params.amount);

    uint256 poolsLength = pools.length;
    ICollectionRouter.PoolSwapSpecific[] memory swapList;
    for (uint256 i; i < poolsLength; ) {
      // Build router data
      swapList = new ICollectionRouter.PoolSwapSpecific[](1);
      swapList[0] = ICollectionRouter.PoolSwapSpecific({
        pool: pools[i],
        nftIds: new uint256[](1),
        proof: orderParams[i].proof,
        proofFlags: orderParams[i].proofFlags,
        externalFilterContext: orderParams[i].externalFilterContext
      });
      swapList[0].nftIds[0] = orderParams[i].nftId;

      // Fetch the current price quote
      (, , uint256 price, ) = pools[i].getBuyNFTQuote(1);

      // Execute fill
      try
        COLLECTION_ROUTER.swapERC20ForSpecificNFTs(swapList, price, params.fillTo, deadline)
      {} catch {
        if (params.revertIfIncomplete) {
          revert UnsuccessfulFill();
        }
      }

      unchecked {
        ++i;
      }
    }
  }

  // --- Single ERC721 offer ---

  function sell(
    ICollectionPool pool,
    CollectionXyzOrderParams calldata orderParams,
    uint256 minOutput,
    uint256 deadline,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    IERC721 collection = pool.nft();

    // Approve the router if needed
    _approveERC721IfNeeded(collection, address(COLLECTION_ROUTER));

    // Build router data
    ICollectionRouter.PoolSwapSpecific[] memory swapList = new ICollectionRouter.PoolSwapSpecific[](
      1
    );
    swapList[0] = ICollectionRouter.PoolSwapSpecific({
      pool: pool,
      nftIds: new uint256[](1),
      proof: orderParams.proof,
      proofFlags: orderParams.proofFlags,
      externalFilterContext: orderParams.externalFilterContext
    });
    swapList[0].nftIds[0] = orderParams.nftId;

    // Execute fill
    try COLLECTION_ROUTER.swapNFTsForToken(swapList, minOutput, address(this), deadline) {
      ICollectionPool.PoolVariant variant = pool.poolVariant();

      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        uint8(variant) < 2
          ? _sendETH(fee.recipient, fee.amount)
          : _sendERC20(fee.recipient, fee.amount, pool.token());

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      uint8(variant) < 2 ? _sendAllETH(params.fillTo) : _sendAllERC20(params.fillTo, pool.token());
    } catch {
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }

    // Refund any ERC721 leftover
    _sendAllERC721(params.refundTo, collection, orderParams.nftId);
  }

  // --- ERC721 hooks ---

  // Single token offer acceptance can be done approval-less by using the
  // standard `safeTransferFrom` method together with specifying data for
  // further contract calls. An example:
  // `safeTransferFrom(
  //      0xWALLET,
  //      0xMODULE,
  //      TOKEN_ID,
  //      0xABI_ENCODED_ROUTER_EXECUTION_CALLDATA_FOR_OFFER_ACCEPTANCE
  // )`

  function onERC721Received(
    address, // operator,
    address, // from
    uint256, // tokenId,
    bytes calldata data
  ) external returns (bytes4) {
    if (data.length > 0) {
      _makeCall(router, data, 0);
    }

    return this.onERC721Received.selector;
  }
}
