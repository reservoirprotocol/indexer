// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {BaseExchangeModule} from "./BaseExchangeModule.sol";
import {BaseModule} from "../BaseModule.sol";
import {IZeroExV4} from "../../../interfaces/IZeroExV4.sol";

// Notes:
// - supports filling listings (both ERC721/ERC1155)
// - supports filling offers (both ERC721/ERC1155)

contract ZeroExV4Module is BaseExchangeModule {
    using SafeERC20 for IERC20;

    // --- Fields ---

    IZeroExV4 public constant EXCHANGE =
        IZeroExV4(0xDef1C0ded9bec7F1a1670819833240f027b25EfF);

    // --- Constructor ---

    constructor(address owner, address router)
        BaseModule(owner)
        BaseExchangeModule(router)
    {}

    // --- Fallback ---

    receive() external payable {}

    // --- [ERC721] Single ETH listing ---

    function acceptETHListingERC721(
        IZeroExV4.ERC721Order calldata order,
        IZeroExV4.Signature calldata signature,
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
        _buyERC721(
            order,
            signature,
            params.fillTo,
            params.revertIfIncomplete,
            params.amount
        );
    }

    // --- [ERC721] Single ERC20 listing ---

    function acceptERC20ListingERC721(
        IZeroExV4.ERC721Order calldata order,
        IZeroExV4.Signature calldata signature,
        ERC20ListingParams calldata params,
        Fee[] calldata fees
    )
        external
        payable
        nonReentrant
        refundERC20Leftover(params.refundTo, params.token)
        chargeERC20Fees(fees, params.token, params.amount)
    {
        // Approve the exchange if needed
        _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

        // Execute fill
        _buyERC721(
            order,
            signature,
            params.fillTo,
            params.revertIfIncomplete,
            0
        );
    }

    // --- [ERC721] Multiple ETH listings ---

    function acceptETHListingsERC721(
        IZeroExV4.ERC721Order[] calldata orders,
        IZeroExV4.Signature[] calldata signatures,
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
        _buyERC721s(
            orders,
            signatures,
            params.fillTo,
            params.revertIfIncomplete,
            params.amount
        );
    }

    // --- [ERC721] Multiple ERC20 listings ---

    function acceptERC20ListingsERC721(
        IZeroExV4.ERC721Order[] calldata orders,
        IZeroExV4.Signature[] calldata signatures,
        ERC20ListingParams calldata params,
        Fee[] calldata fees
    )
        external
        payable
        nonReentrant
        refundERC20Leftover(params.refundTo, params.token)
        chargeERC20Fees(fees, params.token, params.amount)
    {
        // Approve the exchange if needed
        _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

        // Execute fill
        _buyERC721s(
            orders,
            signatures,
            params.fillTo,
            params.revertIfIncomplete,
            0
        );
    }

    // --- [ERC1155] Single ETH listing ---

    function acceptETHListingERC1155(
        IZeroExV4.ERC1155Order calldata order,
        IZeroExV4.Signature calldata signature,
        uint128 amount,
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
        _buyERC1155(
            order,
            signature,
            amount,
            params.fillTo,
            params.revertIfIncomplete,
            params.amount
        );
    }

    // --- [ERC1155] Single ERC20 listing ---

    function acceptERC20ListingERC1155(
        IZeroExV4.ERC1155Order calldata order,
        IZeroExV4.Signature calldata signature,
        uint128 amount,
        ERC20ListingParams calldata params,
        Fee[] calldata fees
    )
        external
        payable
        nonReentrant
        refundERC20Leftover(params.refundTo, params.token)
        chargeERC20Fees(fees, params.token, params.amount)
    {
        // Approve the exchange if needed
        _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

        // Execute fill
        _buyERC1155(
            order,
            signature,
            amount,
            params.fillTo,
            params.revertIfIncomplete,
            0
        );
    }

    // --- [ERC1155] Multiple ETH listings ---

    function acceptETHListingsERC1155(
        IZeroExV4.ERC1155Order[] calldata orders,
        IZeroExV4.Signature[] calldata signatures,
        uint128[] memory amounts,
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
        _buyERC1155s(
            orders,
            signatures,
            amounts,
            params.fillTo,
            params.revertIfIncomplete,
            params.amount
        );
    }

    // --- [ERC1155] Multiple ERC20 listings ---

    function acceptERC20ListingsERC1155(
        IZeroExV4.ERC1155Order[] calldata orders,
        IZeroExV4.Signature[] calldata signatures,
        uint128[] memory amounts,
        ERC20ListingParams calldata params,
        Fee[] calldata fees
    )
        external
        payable
        nonReentrant
        refundERC20Leftover(params.refundTo, params.token)
        chargeERC20Fees(fees, params.token, params.amount)
    {
        // Approve the exchange if needed
        _approveERC20IfNeeded(params.token, address(EXCHANGE), params.amount);

        // Execute fill
        _buyERC1155s(
            orders,
            signatures,
            amounts,
            params.fillTo,
            params.revertIfIncomplete,
            0
        );
    }

    // --- [ERC721] Single offer ---

    function acceptERC721Offer(
        IZeroExV4.ERC721Order calldata order,
        IZeroExV4.Signature calldata signature,
        OfferParams calldata params,
        uint256 tokenId,
        Fee[] calldata fees
    ) external nonReentrant {
        // Approve the exchange if needed
        _approveERC721IfNeeded(order.erc721Token, address(EXCHANGE));

        // Execute fill
        try EXCHANGE.sellERC721(order, signature, tokenId, false, "") {
            // Pay fees
            uint256 feesLength = fees.length;
            for (uint256 i; i < feesLength; ) {
                Fee memory fee = fees[i];
                _sendERC20(fee.recipient, fee.amount, order.erc20Token);

                unchecked {
                    ++i;
                }
            }

            // Forward any left payment to the specified receiver
            _sendAllERC20(params.fillTo, order.erc20Token);
        } catch {
            // Revert if specified
            if (params.revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }

        // Refund any ERC721 leftover
        _sendAllERC721(params.refundTo, order.erc721Token, tokenId);
    }

    // --- [ERC1155] Single offer ---

    function acceptERC1155Offer(
        IZeroExV4.ERC1155Order calldata order,
        IZeroExV4.Signature calldata signature,
        uint128 amount,
        OfferParams calldata params,
        uint256 tokenId,
        Fee[] calldata fees
    ) external nonReentrant {
        // Approve the exchange if needed
        _approveERC1155IfNeeded(order.erc1155Token, address(EXCHANGE));

        // Execute fill
        try EXCHANGE.sellERC1155(order, signature, tokenId, amount, false, "") {
            // Pay fees
            uint256 feesLength = fees.length;
            for (uint256 i; i < feesLength; ) {
                Fee memory fee = fees[i];
                _sendERC20(fee.recipient, fee.amount, order.erc20Token);

                unchecked {
                    ++i;
                }
            }

            // Forward any left payment to the specified receiver
            _sendAllERC20(params.fillTo, order.erc20Token);
        } catch {
            // Revert if specified
            if (params.revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }

        // Refund any ERC1155 leftover
        _sendAllERC1155(params.refundTo, order.erc1155Token, tokenId);
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

    function _buyERC721(
        IZeroExV4.ERC721Order calldata order,
        IZeroExV4.Signature calldata signature,
        address receiver,
        bool revertIfIncomplete,
        uint256 value
    ) internal {
        // Execute fill
        try EXCHANGE.buyERC721{value: value}(order, signature, "") {
            order.erc721Token.safeTransferFrom(
                address(this),
                receiver,
                order.erc721TokenId
            );
        } catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }
    }

    function _buyERC1155(
        IZeroExV4.ERC1155Order calldata order,
        IZeroExV4.Signature calldata signature,
        uint128 amount,
        address receiver,
        bool revertIfIncomplete,
        uint256 value
    ) internal {
        try EXCHANGE.buyERC1155{value: value}(order, signature, amount, "") {
            order.erc1155Token.safeTransferFrom(
                address(this),
                receiver,
                order.erc1155TokenId,
                amount,
                ""
            );
        } catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }
    }

    function _buyERC721s(
        IZeroExV4.ERC721Order[] calldata orders,
        IZeroExV4.Signature[] calldata signatures,
        address receiver,
        bool revertIfIncomplete,
        uint256 value
    ) internal {
        uint256 length = orders.length;

        // Execute fill
        try
            EXCHANGE.batchBuyERC721s{value: value}(
                orders,
                signatures,
                new bytes[](length),
                revertIfIncomplete
            )
        returns (bool[] memory fulfilled) {
            for (uint256 i = 0; i < length; ) {
                if (fulfilled[i]) {
                    orders[i].erc721Token.safeTransferFrom(
                        address(this),
                        receiver,
                        orders[i].erc721TokenId
                    );
                }

                unchecked {
                    ++i;
                }
            }
        } catch {
            // Revert if specified
            if (revertIfIncomplete) {
                revert UnsuccessfulFill();
            }
        }
    }

    function _buyERC1155s(
        IZeroExV4.ERC1155Order[] calldata orders,
        IZeroExV4.Signature[] calldata signatures,
        uint128[] memory amounts,
        address receiver,
        bool revertIfIncomplete,
        uint256 value
    ) internal {
        uint256 length = orders.length;

        uint128[] memory fillAmounts = new uint128[](length);
        for (uint256 i = 0; i < length; ) {
            fillAmounts[i] = amounts[i];

            unchecked {
                ++i;
            }
        }

        // Execute fill
        try
            EXCHANGE.batchBuyERC1155s{value: value}(
                orders,
                signatures,
                fillAmounts,
                new bytes[](length),
                revertIfIncomplete
            )
        returns (bool[] memory fulfilled) {
            for (uint256 i = 0; i < length; ) {
                if (fulfilled[i]) {
                    orders[i].erc1155Token.safeTransferFrom(
                        address(this),
                        receiver,
                        orders[i].erc1155TokenId,
                        fillAmounts[i],
                        ""
                    );
                }

                unchecked {
                    ++i;
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
