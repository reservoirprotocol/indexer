// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IWETH} from "../../../interfaces/IWETH.sol";
import {IMidasFactory, IMidasPair, IMidasRouter} from "../../../interfaces/IMidaswap.sol";

contract MidaswapModule is BaseExchangeModule {
  IWETH public immutable WETH;
  IMidasFactory public immutable MIDAS_FACTORY;
  IMidasRouter public immutable MIDAS_ROUTER;

  // --- Constructor ---

  constructor(
    address owner,
    address router,
    IMidasFactory factory,
    IMidasRouter midasRouter,
    IWETH weth
  ) BaseModule(owner) BaseExchangeModule(router) {
    MIDAS_FACTORY = factory;
    MIDAS_ROUTER = midasRouter;
    WETH = weth;
  }

  // --- Fallback ---

  receive() external payable {}

  // --- Multiple ETH listings ---

  function buyWithETH(
    address[] calldata nfts,
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
    uint256 length = nfts.length;
    for (uint256 i; i < length; ) {
      // Execute fill
      _buyItemWithETH(nfts[i], address(WETH), params.fillTo, nftIds[i], params.revertIfIncomplete);

      unchecked {
        ++i;
      }
    }
  }

  // --- Multiple ERC20 listings ---

  function buyWithERC20(
    address[] calldata nfts,
    uint256[] calldata nftIds,
    ERC20ListingParams calldata params,
    Fee[] calldata fees
  )
    external
    nonReentrant
    refundERC20Leftover(params.refundTo, params.token)
    chargeERC20Fees(fees, params.token, params.amount)
  {
    uint256 length = nfts.length;
    for (uint256 i; i < length; ) {
      // Execute fill
      _buyItem(nfts[i], address(params.token), params.fillTo, nftIds[i], params.revertIfIncomplete);

      unchecked {
        ++i;
      }
    }
  }

  // --- Single offer ---

  function sell(
    address nft,
    address token,
    uint256 nftId,
    OfferParams calldata params,
    Fee[] calldata fees
  ) external nonReentrant {
    if (token == address(0)) {
      // Execute fill
      _sellItemToETH(nft, address(WETH), nftId, params.revertIfIncomplete);

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
    } else {
      // Execute fill
      _sellItem(nft, token, nftId, params.revertIfIncomplete);

      // Pay fees
      uint256 feesLength = fees.length;
      for (uint256 i; i < feesLength; ) {
        Fee memory fee = fees[i];
        _sendERC20(fee.recipient, fee.amount, IERC20(token));

        unchecked {
          ++i;
        }
      }

      // Forward any left payment to the specified receiver
      _sendAllERC20(params.fillTo, IERC20(token));
    }

    // Refund any leftovers
    _sendAllERC721(params.refundTo, IERC721(nft), nftId);
  }

  // --- ERC721 hooks ---

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

  // --- Internal ---

  function _buyItemWithETH(
    address tokenX,
    address tokenY,
    address to,
    uint256 tokenId,
    bool revertIfIncomplete
  ) internal {
    address pair = MIDAS_FACTORY.getPairERC721(tokenX, tokenY);

    uint256[] memory tokenIds = new uint256[](1);
    tokenIds[0] = tokenId;

    uint256 amount = MIDAS_ROUTER.getMinAmountIn(pair, tokenIds);
    WETH.deposit{value: amount}();
    WETH.transfer(pair, amount);

    // Execute the fill
    try IMidasPair(pair).buyNFT(tokenId, to) {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _buyItem(
    address tokenX,
    address tokenY,
    address to,
    uint256 tokenId,
    bool revertIfIncomplete
  ) internal {
    address pair = MIDAS_FACTORY.getPairERC721(tokenX, tokenY);

    uint256[] memory tokenIds = new uint256[](1);
    tokenIds[0] = tokenId;

    uint256 amount = MIDAS_ROUTER.getMinAmountIn(pair, tokenIds);
    IERC20(tokenY).transferFrom(address(this), pair, amount);

    // Execute the fill
    try IMidasPair(pair).buyNFT(tokenId, to) {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _sellItemToETH(
    address tokenX,
    address tokenY,
    uint256 tokenId,
    bool revertIfIncomplete
  ) internal {
    address pair = MIDAS_FACTORY.getPairERC721(tokenX, tokenY);

    IERC721(tokenX).safeTransferFrom(address(this), pair, tokenId);

    // Execute the fill
    try IMidasPair(pair).sellNFT(tokenId, address(this)) returns (uint128 amount) {
      // Unwrap the WETH
      WETH.withdraw(uint256(amount));
    } catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }

  function _sellItem(
    address tokenX,
    address tokenY,
    uint256 tokenId,
    bool revertIfIncomplete
  ) internal {
    address pair = MIDAS_FACTORY.getPairERC721(tokenX, tokenY);

    IERC721(tokenX).safeTransferFrom(address(this), pair, tokenId);

    // Execute the fill
    try IMidasPair(pair).sellNFT(tokenId, address(this)) {} catch {
      // Revert if specified
      if (revertIfIncomplete) {
        revert UnsuccessfulFill();
      }
    }
  }
}
