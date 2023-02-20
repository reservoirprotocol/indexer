// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IRarible} from "../../../interfaces/IRarible.sol";

// Notes:
// - supports filling listings (both ERC721/ERC1155 but only ETH-denominated)
// - supports filling offers (both ERC721/ERC1155)

contract RaribleModule is BaseExchangeModule {
    using SafeERC20 for IERC20;

    // --- Fields ---

    IRarible public constant EXCHANGE =
        IRarible(0x9757F2d2b135150BBeb65308D4a91804107cd8D6);

    address public constant TRANSFER_MANAGER =
        0x4feE7B061C97C9c496b01DbcE9CDb10c02f0a0Be;

    bytes4 public constant ERC721_INTERFACE = 0x80ac58cd;
    bytes4 public constant ERC1155_INTERFACE = 0xd9b67a26;

    // --- Constructor ---

    constructor(address owner, address router)
        BaseModule(owner)
        BaseExchangeModule(router)
    {}

    // --- Single ETH listing ---

    function acceptETHListing(
        IRarible.Order calldata orderLeft,
        bytes calldata signatureLeft,
        IRarible.Order calldata orderRight,
        bytes calldata signatureRight,
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
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            params.fillTo,
            params.revertIfIncomplete,
            params.amount
        );
    }

    // --- Multiple ETH listings ---

    function acceptETHListings(
        IRarible.Order[] calldata ordersLeft,
        bytes[] calldata signaturesLeft,
        IRarible.Order[] calldata ordersRight,
        bytes calldata signatureRight,
        ETHListingParams calldata params,
        Fee[] calldata fees
    )
        external
        payable
        nonReentrant
        refundETHLeftover(params.refundTo)
        chargeETHFees(fees, params.amount)
    {
        for (uint256 i = 0; i < ordersLeft.length; ) {
            IRarible.Order calldata orderLeft = ordersLeft[i];
            IRarible.Order calldata orderRight = ordersRight[i];

            // Execute fill
            _buy(
                orderLeft,
                signaturesLeft[i],
                orderRight,
                signatureRight,
                params.fillTo,
                params.revertIfIncomplete,
                orderLeft.takeAsset.value
            );

            unchecked {
                ++i;
            }
        }
    }

    // --- [ERC721] Single offer ---

    function acceptERC721Offer(
        IRarible.Order calldata orderLeft,
        bytes calldata signatureLeft,
        IRarible.Order calldata orderRight,
        bytes calldata signatureRight,
        OfferParams calldata params,
        Fee[] calldata fees
    ) external nonReentrant {
        (address token, uint256 tokenId) = abi.decode(
            orderRight.makeAsset.assetType.data,
            (address, uint256)
        );

        IERC721 collection = IERC721(address(token));

        // Approve the transfer manager if needed
        _approveERC721IfNeeded(collection, TRANSFER_MANAGER);

        // Execute the fill
        _sell(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            params.fillTo,
            params.revertIfIncomplete,
            fees
        );

        // Refund any ERC721 leftover
        _sendAllERC721(params.refundTo, collection, tokenId);
    }

    // --- [ERC1155] Single offer ---

    function acceptERC1155Offer(
        IRarible.Order calldata orderLeft,
        bytes calldata signatureLeft,
        IRarible.Order calldata orderRight,
        bytes calldata signatureRight,
        OfferParams calldata params,
        Fee[] calldata fees
    ) external nonReentrant {
        (address token, uint256 tokenId) = abi.decode(
            orderRight.makeAsset.assetType.data,
            (address, uint256)
        );

        IERC1155 collection = IERC1155(address(token));

        // Approve the transfer manager if needed
        _approveERC1155IfNeeded(collection, TRANSFER_MANAGER);

        // Execute the fill
        _sell(
            orderLeft,
            signatureLeft,
            orderRight,
            signatureRight,
            params.fillTo,
            params.revertIfIncomplete,
            fees
        );

        // Refund any ERC1155 leftover
        _sendAllERC1155(params.refundTo, collection, tokenId);
    }

    // --- ERC721 / ERC1155 hooks ---

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
        IRarible.Order calldata orderLeft,
        bytes calldata signatureLeft,
        IRarible.Order calldata orderRight,
        bytes calldata signatureRight,
        address receiver,
        bool revertIfIncomplete,
        uint256 value
    ) internal {
        // Execute the fill
        try
            EXCHANGE.matchOrders{value: value}(
                orderLeft,
                signatureLeft,
                orderRight,
                signatureRight
            )
        {
            (address token, uint256 tokenId) = abi.decode(
                orderLeft.makeAsset.assetType.data,
                (address, uint256)
            );
            IERC165 collection = IERC165(token);

            // Forward any token to the specified receiver
            bool isERC721 = collection.supportsInterface(ERC721_INTERFACE);
            if (isERC721) {
                IERC721(address(collection)).safeTransferFrom(
                    address(this),
                    receiver,
                    tokenId
                );
            } else {
                IERC1155(address(collection)).safeTransferFrom(
                    address(this),
                    receiver,
                    tokenId,
                    orderLeft.makeAsset.value,
                    ""
                );
            }
        } catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }
    }

    function _sell(
        IRarible.Order calldata orderLeft,
        bytes calldata signatureLeft,
        IRarible.Order calldata orderRight,
        bytes calldata signatureRight,
        address receiver,
        bool revertIfIncomplete,
        Fee[] calldata fees
    ) internal {
        // Execute the fill
        try
            EXCHANGE.matchOrders(
                orderLeft,
                signatureLeft,
                orderRight,
                signatureRight
            )
        {
            // Pay fees
            address token = abi.decode(
                orderLeft.makeAsset.assetType.data,
                (address)
            );
            uint256 feesLength = fees.length;
            for (uint256 i; i < feesLength; ) {
                Fee memory fee = fees[i];

                _sendERC20(fee.recipient, fee.amount, IERC20(token));

                unchecked {
                    ++i;
                }
            }

            // Forward any left payment to the specified receiver
            _sendAllERC20(receiver, IERC20(token));
        } catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }
    }
}
