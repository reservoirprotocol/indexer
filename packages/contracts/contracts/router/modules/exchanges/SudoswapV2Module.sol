// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {ISudoswapPairV2} from "../../../interfaces/ISudoswapV2.sol";

contract SudoswapV2Module is BaseExchangeModule {
  // --- Constructor ---

  constructor(address owner, address router) BaseModule(owner) BaseExchangeModule(router) {}

  // --- Fallback ---

  receive() external payable {}

  // --- Multiple ETH listings ---

  function buyWithETH(
    ISudoswapPairV2[] calldata pairs,
    // Token ids for ERC721 pairs, amounts for ERC1155 pairs
    uint256[] calldata nftIds,
    ETHListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundETHLeftover(params.refundTo)
    chargeETHFees(fees, params.amount)
  {
    uint256[] memory tokenIds = new uint256[](1);

    uint256 pairsLength = pairs.length;
    for (uint256 i; i < pairsLength; ) {
      ISudoswapPairV2 pair = pairs[i];
      ISudoswapPairV2.PairVariant variant = pair.pairVariant();

      bool isERC1155 = isERC1155Pair(variant);

      // Fetch the current price
      (, , , uint256 price, , ) = pair.getBuyNFTQuote(
        isERC1155 ? pair.nftId() : nftIds[i],
        isERC1155 ? nftIds[i] : 1
      );

      tokenIds[0] = nftIds[i];

      // Execute fill
      try
        pair.swapTokenForSpecificNFTs{value: price}(
          tokenIds,
          price,
          params.fillTo,
          false,
          address(0)
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
    ISudoswapPairV2[] calldata pairs,
    // Token ids for ERC721 pairs, amounts for ERC1155 pairs
    uint256[] calldata nftIds,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    payable
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    uint256[] memory tokenIds = new uint256[](1);

    uint256 pairsLength = pairs.length;
    for (uint256 i; i < pairsLength; ) {
      ISudoswapPairV2 pair = pairs[i];
      ISudoswapPairV2.PairVariant variant = pair.pairVariant();

      bool isERC1155 = isERC1155Pair(variant);

      // Fetch the current price
      (, , , uint256 price, , ) = pair.getBuyNFTQuote(
        isERC1155 ? pair.nftId() : nftIds[i],
        isERC1155 ? nftIds[i] : 1
      );

      tokenIds[0] = nftIds[i];

      // Approve the pair if needed
      _approveERC20IfNeeded(params.token, address(pair), params.amount);

      // Execute fill
      try
        pair.swapTokenForSpecificNFTs(tokenIds, price, params.fillTo, false, address(0))
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

  // --- Single offer ---

  function sell(
    ISudoswapPairV2 pair,
    // Token id for ERC721 pairs, amount for ERC1155 pairs
    uint256 nftId,
    uint256 minOutput,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    ISudoswapPairV2.PairVariant variant = pair.pairVariant();

    bool isETH = isETHPair(variant);
    address nft = pair.nft();

    IERC20 token = isETH ? IERC20(address(0)) : pair.token();

    // Approve the pair if needed
    if (!isERC1155Pair(variant)) {
      _approveERC721IfNeeded(IERC721(nft), address(pair));
    } else {
      _approveERC1155IfNeeded(IERC1155(nft), address(pair));
    }

    // Build router data
    uint256[] memory tokenIds = new uint256[](1);
    tokenIds[0] = nftId;

    // Execute fill
    try pair.swapNFTsForToken(tokenIds, minOutput, payable(address(this)), false, address(0)) {
      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        isETH ? _sendETH(fee.recipient, fee.amount) : _sendERC20(fee.recipient, fee.amount, token);

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      isETH ? _sendAllETH(params.fillTo) : _sendAllERC20(params.fillTo, token);
    } catch {
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }

    // Refund any leftovers
    if (!isERC1155Pair(variant)) {
      _sendAllERC721(params.refundTo, IERC721(nft), nftId);
    } else {
      _sendAllERC1155(params.refundTo, IERC1155(nft), pair.nftId());
    }
  }

  // --- ERC721/1155 hooks ---

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

  function onERC1155Received(
    address, // operator
    address, // from
    uint256, // tokenId
    uint256, // amount
    bytes calldata data
  ) external returns (bytes4) {
    if (data.length > 0) {
      _makeCall(router, data, 0);
    }

    return this.onERC1155Received.selector;
  }

  // --- Internal methods ---

  function isERC1155Pair(ISudoswapPairV2.PairVariant vaiant) internal pure returns (bool) {
    return
      ISudoswapPairV2.PairVariant.ERC1155_ERC20 == vaiant ||
      ISudoswapPairV2.PairVariant.ERC1155_ETH == vaiant;
  }

  function isETHPair(ISudoswapPairV2.PairVariant vaiant) internal pure returns (bool) {
    return
      ISudoswapPairV2.PairVariant.ERC721_ETH == vaiant ||
      ISudoswapPairV2.PairVariant.ERC1155_ETH == vaiant;
  }
}
