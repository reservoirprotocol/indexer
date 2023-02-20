// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IBlur} from "../../../interfaces/IBlur.sol";

// Notes:
// - supports filling listings (both ERC721/ERC1155 but only ETH-denominated)

contract BlurModule is BaseExchangeModule {
    using SafeERC20 for IERC20;

    // --- Fields ---

    IBlur public constant EXCHANGE =
        IBlur(0x000000000000Ad05Ccc4F10045630fb830B95127);

    address public constant EXECUTION_DELEGATE =
        0x00000000000111AbE46ff893f3B2fdF1F759a8A8;

    bytes4 public constant ERC721_INTERFACE = 0x80ac58cd;
    bytes4 public constant ERC1155_INTERFACE = 0xd9b67a26;

    // --- Constructor ---

    constructor(address owner, address router)
        BaseModule(owner)
        BaseExchangeModule(router)
    {}

    // --- Fallback ---

    receive() external payable {}

    // --- Single ETH listing ---

    function acceptETHListing(
        IBlur.Input calldata sell,
        IBlur.Input calldata buy,
        ETHListingParams calldata params,
        Fee[] calldata fees
    )
        external
        payable
        nonReentrant
        refundETHLeftover(params.refundTo)
        chargeETHFees(fees, params.amount)
    {
        // Execute fill
        _buy(
            sell,
            buy,
            params.fillTo,
            params.revertIfIncomplete,
            params.amount
        );
    }

    // --- Multiple ETH listings ---

    function acceptETHListings(
        IBlur.Input[] calldata sells,
        IBlur.Input[] calldata buys,
        ETHListingParams calldata params,
        Fee[] calldata fees
    )
        external
        payable
        nonReentrant
        refundETHLeftover(params.refundTo)
        chargeETHFees(fees, params.amount)
    {
        uint256 length = sells.length;
        for (uint256 i = 0; i < length; ) {
            // Use `memory` to avoid `Stack too deep` errors
            IBlur.Input memory sell = sells[i];

            // Execute fill
            _buy(
                sells[i],
                buys[i],
                params.fillTo,
                params.revertIfIncomplete,
                sell.order.price
            );

            unchecked {
                ++i;
            }
        }
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

    // --- Internal ---

    function _buy(
        IBlur.Input calldata sell,
        IBlur.Input calldata buy,
        address receiver,
        bool revertIfIncomplete,
        uint256 value
    ) internal {
        // Execute the fill
        try EXCHANGE.execute{value: value}(sell, buy) {
            IERC165 collection = sell.order.collection;

            // Forward any token to the specified receiver
            bool isERC721 = collection.supportsInterface(ERC721_INTERFACE);
            if (isERC721) {
                IERC721(address(collection)).safeTransferFrom(
                    address(this),
                    receiver,
                    sell.order.tokenId
                );
            } else {
                bool isERC1155 = collection.supportsInterface(
                    ERC1155_INTERFACE
                );
                if (isERC1155) {
                    IERC1155(address(collection)).safeTransferFrom(
                        address(this),
                        receiver,
                        sell.order.tokenId,
                        sell.order.amount,
                        ""
                    );
                }
            }
        } catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }
    }
}
