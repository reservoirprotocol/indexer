// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {ICaviarPoolV1} from "../../../interfaces/ICaviarV1.sol";

contract CaviarV1Module is BaseExchangeModule {
  // --- Constructor ---

  constructor(address owner, address router) BaseModule(owner) BaseExchangeModule(router) {}

  // --- Fallback ---

  receive() external payable {}

  // --- Multiple ETH listings ---

  function buyWithETH(
    ICaviarPoolV1[] calldata pairs,
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
      // Fetch the current price
      uint256 inputAmount = pairs[i].buyQuote(1e18);
      uint256 tokenId = nftIds[i];
      tokenIds[0] = tokenId;

      // Execute fill
      try pairs[i].nftBuy{value: inputAmount}(tokenIds, inputAmount, 0) {
        _sendAllERC721(params.fillTo, IERC721(pairs[i].nft()), tokenId);
      } catch {
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
    ICaviarPoolV1 pair,
    uint256 nftId,
    uint256 minOutput,
    ICaviarPoolV1.Message calldata stolenProof,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    address nft = pair.nft();

    // Approve the pair if needed
    _approveERC721IfNeeded(IERC721(nft), address(pair));

    // Build router data
    uint256[] memory tokenIds = new uint256[](1);
    bytes32[][] memory proofs = new bytes32[][](0);
    ICaviarPoolV1.Message[] memory stolenProofs = new ICaviarPoolV1.Message[](1);
    tokenIds[0] = nftId;
    stolenProofs[0] = stolenProof;

    // Execute fill
    try pair.nftSell(tokenIds, minOutput, 0, proofs, stolenProofs) {
      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendETH(fee.recipient, fee.amount);

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      _sendAllETH(params.fillTo);
    } catch {
      if (params.revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }

    // Refund any leftovers
    _sendAllERC721(params.refundTo, IERC721(nft), nftId);
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
}
