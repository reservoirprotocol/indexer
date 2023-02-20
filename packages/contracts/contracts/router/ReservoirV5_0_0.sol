// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

import {ExchangeKind} from "../interfaces/IExchangeKind.sol";
import {IWETH} from "../interfaces/IWETH.sol";

import {IFoundation} from "../interfaces/IFoundation.sol";
import {ILooksRare, ILooksRareTransferSelectorNFT} from "../interfaces/ILooksRare.sol";
import {ISeaport} from "../interfaces/ISeaport.sol";
import {IWyvernV23, IWyvernV23ProxyRegistry} from "../interfaces/IWyvernV23.sol";
import {IX2Y2} from "../interfaces/IX2Y2.sol";
import {IZeroExV4} from "../interfaces/IZeroExV4.sol";

contract ReservoirV5_0_0 is Ownable, ReentrancyGuard {
    address public immutable weth;

    address public immutable looksRare;
    address public immutable looksRareTransferManagerERC721;
    address public immutable looksRareTransferManagerERC1155;

    address public immutable wyvernV23;
    address public immutable wyvernV23Proxy;

    address public immutable zeroExV4;

    address public immutable foundation;

    address public immutable x2y2;
    address public immutable x2y2ERC721Delegate;

    address public immutable seaport;

    error UnexpectedOwnerOrBalance();
    error UnexpectedSelector();
    error UnsuccessfulCall();
    error UnsuccessfulFill();
    error UnsuccessfulPayment();
    error UnsupportedExchange();

    constructor(
        address wethAddress,
        address looksRareAddress,
        address wyvernV23Address,
        address zeroExV4Address,
        address foundationAddress,
        address x2y2Address,
        address x2y2ERC721DelegateAddress,
        address seaportAddress
    ) {
        weth = wethAddress;

        // --- LooksRare setup ---

        looksRare = looksRareAddress;

        // Cache the transfer manager contracts
        address transferSelectorNFT = ILooksRare(looksRare)
            .transferSelectorNFT();
        looksRareTransferManagerERC721 = ILooksRareTransferSelectorNFT(
            transferSelectorNFT
        ).TRANSFER_MANAGER_ERC721();
        looksRareTransferManagerERC1155 = ILooksRareTransferSelectorNFT(
            transferSelectorNFT
        ).TRANSFER_MANAGER_ERC1155();

        // --- WyvernV23 setup ---

        wyvernV23 = wyvernV23Address;

        // Create a user proxy
        address proxyRegistry = IWyvernV23(wyvernV23).registry();
        IWyvernV23ProxyRegistry(proxyRegistry).registerProxy();
        wyvernV23Proxy = IWyvernV23ProxyRegistry(proxyRegistry).proxies(
            address(this)
        );

        // Approve the token transfer proxy
        IERC20(weth).approve(
            IWyvernV23(wyvernV23).tokenTransferProxy(),
            type(uint256).max
        );

        // --- ZeroExV4 setup ---

        zeroExV4 = zeroExV4Address;

        // --- Foundation setup ---

        foundation = foundationAddress;

        // --- X2Y2 setup ---

        x2y2 = x2y2Address;
        x2y2ERC721Delegate = x2y2ERC721DelegateAddress;

        // --- Seaport setup ---

        seaport = seaportAddress;

        // Approve the exchange
        IERC20(weth).approve(seaport, type(uint256).max);
    }

    receive() external payable {
        // For unwrapping WETH
    }

    function makeCalls(
        address[] calldata targets,
        bytes[] calldata data,
        uint256[] calldata values
    ) external payable onlyOwner nonReentrant {
        bool success;

        uint256 length = targets.length;
        for (uint256 i = 0; i < length; ) {
            (success, ) = payable(targets[i]).call{value: values[i]}(data[i]);
            if (!success) {
                revert UnsuccessfulCall();
            }

            unchecked {
                ++i;
            }
        }
    }

    // Terminology:
    // - "single" -> buy single token
    // - "batch" -> buy multiple tokens (natively, only 0xv4, Seaport and X2Y2 support this)
    // - "multi" -> buy multiple tokens (via the router)

    function singleERC721ListingFill(
        bytes calldata data,
        ExchangeKind exchangeKind,
        address collection,
        uint256 tokenId,
        address receiver,
        address feeRecipient,
        uint16 feeBps
    ) external payable nonReentrant {
        bytes4 selector = bytes4(data[:4]);

        address target;
        if (exchangeKind == ExchangeKind.SEAPORT) {
            target = seaport;
            if (
                selector != ISeaport.fulfillAdvancedOrder.selector &&
                selector != ISeaport.matchAdvancedOrders.selector
            ) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.WYVERN_V23) {
            target = wyvernV23;
            if (selector != IWyvernV23.atomicMatch_.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.LOOKS_RARE) {
            target = looksRare;
            if (
                selector !=
                ILooksRare.matchAskWithTakerBidUsingETHAndWETH.selector
            ) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.ZEROEX_V4) {
            target = zeroExV4;
            if (selector != IZeroExV4.buyERC721.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.X2Y2) {
            target = x2y2;
            if (selector != IX2Y2.run.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.FOUNDATION) {
            target = foundation;
            if (selector != IFoundation.buyV2.selector) {
                revert UnexpectedSelector();
            }
        } else {
            revert UnsupportedExchange();
        }

        uint256 payment = (10000 * msg.value) / (10000 + feeBps);

        (bool success, ) = target.call{value: payment}(data);
        if (!success) {
            revert UnsuccessfulFill();
        }

        if (
            exchangeKind != ExchangeKind.SEAPORT &&
            exchangeKind != ExchangeKind.WYVERN_V23
        ) {
            // When filling anything other than Wyvern or Seaport we need to send
            // the NFT to the taker's wallet after the fill (since we cannot have
            // a recipient other than the taker)
            IERC721(collection).safeTransferFrom(
                address(this),
                receiver,
                tokenId
            );
        }

        uint256 fee = msg.value - payment;
        if (fee > 0) {
            (success, ) = payable(feeRecipient).call{value: fee}("");
            if (!success) {
                revert UnsuccessfulPayment();
            }
        }
    }

    function singleERC721ListingFillWithPrecheck(
        bytes calldata data,
        ExchangeKind exchangeKind,
        address collection,
        uint256 tokenId,
        address receiver,
        address expectedOwner,
        address feeRecipient,
        uint16 feeBps
    ) external payable nonReentrant {
        if (
            expectedOwner != address(0) &&
            IERC721(collection).ownerOf(tokenId) != expectedOwner
        ) {
            revert UnexpectedOwnerOrBalance();
        }

        bytes4 selector = bytes4(data[:4]);

        address target;
        if (exchangeKind == ExchangeKind.SEAPORT) {
            target = seaport;
            if (
                selector != ISeaport.fulfillAdvancedOrder.selector &&
                selector != ISeaport.matchAdvancedOrders.selector
            ) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.WYVERN_V23) {
            target = wyvernV23;
            if (selector != IWyvernV23.atomicMatch_.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.LOOKS_RARE) {
            target = looksRare;
            if (
                selector !=
                ILooksRare.matchAskWithTakerBidUsingETHAndWETH.selector
            ) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.ZEROEX_V4) {
            target = zeroExV4;
            if (selector != IZeroExV4.buyERC721.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.X2Y2) {
            target = x2y2;
            if (selector != IX2Y2.run.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.FOUNDATION) {
            target = foundation;
            if (selector != IFoundation.buyV2.selector) {
                revert UnexpectedSelector();
            }
        } else {
            revert UnsupportedExchange();
        }

        uint256 payment = (10000 * msg.value) / (10000 + feeBps);

        (bool success, ) = target.call{value: payment}(data);
        if (!success) {
            revert UnsuccessfulFill();
        }

        if (
            exchangeKind != ExchangeKind.SEAPORT &&
            exchangeKind != ExchangeKind.WYVERN_V23
        ) {
            // When filling anything other than Wyvern or Seaport we need to send
            // the NFT to the taker's wallet after the fill (since we cannot have
            // a recipient other than the taker)
            IERC721(collection).safeTransferFrom(
                address(this),
                receiver,
                tokenId
            );
        }

        uint256 fee = msg.value - payment;
        if (fee > 0) {
            (success, ) = payable(feeRecipient).call{value: fee}("");
            if (!success) {
                revert UnsuccessfulPayment();
            }
        }
    }

    function batchERC721ListingFill(
        bytes calldata data,
        address[] calldata collections,
        uint256[] calldata tokenIds,
        address receiver,
        address feeRecipient,
        uint16 feeBps
    ) external payable nonReentrant {
        // Only `zeroExV4` is supported
        if (bytes4(data[:4]) != IZeroExV4.batchBuyERC721s.selector) {
            revert UnexpectedSelector();
        }

        uint256 payment = (10000 * msg.value) / (10000 + feeBps);

        (bool success, ) = zeroExV4.call{value: payment}(data);
        if (!success) {
            revert UnsuccessfulFill();
        }

        // When filling anything other than Wyvern or Seaport we need to send
        // the NFT to the taker's wallet after the fill (since we cannot have
        // a recipient other than the taker)
        uint256 length = collections.length;
        for (uint256 i = 0; i < length; ) {
            IERC721(collections[i]).safeTransferFrom(
                address(this),
                receiver,
                tokenIds[i]
            );

            unchecked {
                ++i;
            }
        }

        uint256 fee = msg.value - payment;
        if (fee > 0) {
            (success, ) = payable(feeRecipient).call{value: fee}("");
            if (!success) {
                revert UnsuccessfulPayment();
            }
        }
    }

    function singleERC721BidFill(
        bytes calldata data,
        ExchangeKind exchangeKind,
        address collection,
        address receiver,
        bool unwrapWeth
    ) external payable nonReentrant {
        bytes4 selector = bytes4(data[:4]);

        address target;
        address operator;
        if (exchangeKind == ExchangeKind.SEAPORT) {
            target = seaport;
            operator = seaport;
            if (
                selector != ISeaport.fulfillAdvancedOrder.selector &&
                selector != ISeaport.matchAdvancedOrders.selector
            ) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.WYVERN_V23) {
            target = wyvernV23;
            operator = wyvernV23Proxy;
            if (selector != IWyvernV23.atomicMatch_.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.LOOKS_RARE) {
            target = looksRare;
            operator = looksRareTransferManagerERC721;
            if (selector != ILooksRare.matchBidWithTakerAsk.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.ZEROEX_V4) {
            target = zeroExV4;
            operator = zeroExV4;
            if (selector != IZeroExV4.sellERC721.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.X2Y2) {
            target = x2y2;
            operator = x2y2ERC721Delegate;
            if (selector != IX2Y2.run.selector) {
                revert UnexpectedSelector();
            }
        } else {
            revert UnsupportedExchange();
        }

        // Approve the exchange to transfer the NFT out of the router
        bool isApproved = IERC721(collection).isApprovedForAll(
            address(this),
            operator
        );
        if (!isApproved) {
            IERC721(collection).setApprovalForAll(operator, true);
        }

        // Get the WETH balance before filling
        uint256 wethBalanceBefore = IERC20(weth).balanceOf(address(this));

        (bool success, ) = target.call{value: msg.value}(data);
        if (!success) {
            revert UnsuccessfulPayment();
        }

        // Send the payment to the actual taker
        uint256 balance = IERC20(weth).balanceOf(address(this)) -
            wethBalanceBefore;
        if (unwrapWeth) {
            IWETH(weth).withdraw(balance);

            (success, ) = payable(receiver).call{value: balance}("");
            if (!success) {
                revert UnsuccessfulPayment();
            }
        } else {
            IERC20(weth).transfer(receiver, balance);
        }
    }

    function singleERC1155ListingFill(
        bytes calldata data,
        ExchangeKind exchangeKind,
        address collection,
        uint256 tokenId,
        uint256 amount,
        address receiver,
        address feeRecipient,
        uint16 feeBps
    ) external payable nonReentrant {
        bytes4 selector = bytes4(data[:4]);

        address target;
        if (exchangeKind == ExchangeKind.SEAPORT) {
            target = seaport;
            if (
                selector != ISeaport.fulfillAdvancedOrder.selector &&
                selector != ISeaport.matchAdvancedOrders.selector
            ) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.WYVERN_V23) {
            target = wyvernV23;
            if (selector != IWyvernV23.atomicMatch_.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.LOOKS_RARE) {
            target = looksRare;
            if (
                selector !=
                ILooksRare.matchAskWithTakerBidUsingETHAndWETH.selector
            ) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.ZEROEX_V4) {
            target = zeroExV4;
            if (selector != IZeroExV4.buyERC1155.selector) {
                revert UnexpectedSelector();
            }
        } else {
            revert UnsupportedExchange();
        }

        uint256 payment = (10000 * msg.value) / (10000 + feeBps);

        (bool success, ) = target.call{value: payment}(data);
        if (!success) {
            revert UnsuccessfulFill();
        }

        if (
            exchangeKind != ExchangeKind.SEAPORT &&
            exchangeKind != ExchangeKind.WYVERN_V23
        ) {
            // When filling anything other than Wyvern or Seaport we need to send
            // the NFT to the taker's wallet after the fill (since we cannot have
            // a recipient other than the taker)
            IERC1155(collection).safeTransferFrom(
                address(this),
                receiver,
                tokenId,
                amount,
                ""
            );
        }

        uint256 fee = msg.value - payment;
        if (fee > 0) {
            (success, ) = payable(feeRecipient).call{value: fee}("");
            if (!success) {
                revert UnsuccessfulPayment();
            }
        }
    }

    function singleERC1155ListingFillWithPrecheck(
        bytes calldata data,
        ExchangeKind exchangeKind,
        address collection,
        uint256 tokenId,
        uint256 amount,
        address receiver,
        address expectedOwner,
        address feeRecipient,
        uint16 feeBps
    ) external payable nonReentrant {
        if (
            expectedOwner != address(0) &&
            IERC1155(collection).balanceOf(expectedOwner, tokenId) < amount
        ) {
            revert UnexpectedOwnerOrBalance();
        }

        bytes4 selector = bytes4(data[:4]);

        address target;
        if (exchangeKind == ExchangeKind.SEAPORT) {
            target = seaport;
            if (
                selector != ISeaport.fulfillAdvancedOrder.selector &&
                selector != ISeaport.matchAdvancedOrders.selector
            ) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.WYVERN_V23) {
            target = wyvernV23;
            if (selector != IWyvernV23.atomicMatch_.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.LOOKS_RARE) {
            target = looksRare;
            if (
                selector !=
                ILooksRare.matchAskWithTakerBidUsingETHAndWETH.selector
            ) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.ZEROEX_V4) {
            target = zeroExV4;
            if (selector != IZeroExV4.buyERC1155.selector) {
                revert UnexpectedSelector();
            }
        } else {
            revert UnsupportedExchange();
        }

        uint256 payment = (10000 * msg.value) / (10000 + feeBps);

        (bool success, ) = target.call{value: payment}(data);
        if (!success) {
            revert UnsuccessfulFill();
        }

        if (
            exchangeKind != ExchangeKind.SEAPORT &&
            exchangeKind != ExchangeKind.WYVERN_V23
        ) {
            // When filling anything other than Wyvern or Seaport we need to send
            // the NFT to the taker's wallet after the fill (since we cannot have
            // a recipient other than the taker)
            IERC1155(collection).safeTransferFrom(
                address(this),
                receiver,
                tokenId,
                amount,
                ""
            );
        }

        uint256 fee = msg.value - payment;
        if (fee > 0) {
            (success, ) = payable(feeRecipient).call{value: fee}("");
            if (!success) {
                revert UnsuccessfulPayment();
            }
        }
    }

    function batchERC1155ListingFill(
        bytes calldata data,
        address[] calldata collections,
        uint256[] calldata tokenIds,
        uint256[] calldata amounts,
        address receiver,
        address feeRecipient,
        uint16 feeBps
    ) external payable nonReentrant {
        // Only `zeroExV4` is supported
        if (bytes4(data[:4]) != IZeroExV4.batchBuyERC1155s.selector) {
            revert UnexpectedSelector();
        }

        uint256 payment = (10000 * msg.value) / (10000 + feeBps);

        (bool success, ) = zeroExV4.call{value: payment}(data);
        if (!success) {
            revert UnsuccessfulFill();
        }

        // Avoid "Stack too deep" errors
        {
            // When filling anything other than Wyvern or Seaport we need to send
            // the NFT to the taker's wallet after the fill (since we cannot have
            // a recipient other than the taker)
            uint256 length = collections.length;
            for (uint256 i = 0; i < length; ) {
                IERC1155(collections[i]).safeTransferFrom(
                    address(this),
                    receiver,
                    tokenIds[i],
                    amounts[i],
                    ""
                );

                unchecked {
                    ++i;
                }
            }
        }

        uint256 fee = msg.value - payment;
        if (fee > 0) {
            (success, ) = payable(feeRecipient).call{value: fee}("");
            if (!success) {
                revert UnsuccessfulPayment();
            }
        }
    }

    function singleERC1155BidFill(
        bytes calldata data,
        ExchangeKind exchangeKind,
        address collection,
        address receiver,
        bool unwrapWeth
    ) external payable nonReentrant {
        bytes4 selector = bytes4(data[:4]);

        address target;
        address operator;
        if (exchangeKind == ExchangeKind.SEAPORT) {
            target = seaport;
            operator = seaport;
            if (
                selector != ISeaport.fulfillAdvancedOrder.selector &&
                selector != ISeaport.matchAdvancedOrders.selector
            ) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.WYVERN_V23) {
            target = wyvernV23;
            operator = wyvernV23Proxy;
            if (selector != IWyvernV23.atomicMatch_.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.LOOKS_RARE) {
            target = looksRare;
            operator = looksRareTransferManagerERC1155;
            if (selector != ILooksRare.matchBidWithTakerAsk.selector) {
                revert UnexpectedSelector();
            }
        } else if (exchangeKind == ExchangeKind.ZEROEX_V4) {
            target = zeroExV4;
            operator = zeroExV4;
            if (selector != IZeroExV4.sellERC1155.selector) {
                revert UnexpectedSelector();
            }
        } else {
            revert UnsupportedExchange();
        }

        // Approve the exchange to transfer the NFT out of the router
        bool isApproved = IERC1155(collection).isApprovedForAll(
            address(this),
            operator
        );
        if (!isApproved) {
            IERC1155(collection).setApprovalForAll(operator, true);
        }

        // Get the WETH balance before filling
        uint256 wethBalanceBefore = IERC20(weth).balanceOf(address(this));

        (bool success, ) = target.call{value: msg.value}(data);
        if (!success) {
            revert UnsuccessfulFill();
        }

        // Send the payment to the actual taker
        uint256 balance = IERC20(weth).balanceOf(address(this)) -
            wethBalanceBefore;
        if (unwrapWeth) {
            IWETH(weth).withdraw(balance);

            (success, ) = payable(receiver).call{value: balance}("");
            if (!success) {
                revert UnsuccessfulPayment();
            }
        } else {
            IERC20(weth).transfer(receiver, balance);
        }
    }

    function multiListingFill(
        bytes[] calldata data,
        uint256[] calldata values,
        bool revertIfIncomplete
    ) external payable {
        bool success;

        uint256 balanceBefore = address(this).balance - msg.value;

        uint256 length = data.length;
        for (uint256 i = 0; i < length; ) {
            (success, ) = address(this).call{value: values[i]}(data[i]);
            if (revertIfIncomplete && !success) {
                revert UnsuccessfulFill();
            }

            unchecked {
                ++i;
            }
        }

        uint256 balanceAfter = address(this).balance;

        if (balanceAfter > balanceBefore) {
            (success, ) = msg.sender.call{value: balanceAfter - balanceBefore}(
                ""
            );
            if (!success) {
                revert UnsuccessfulPayment();
            }
        }
    }

    // ERC721 / ERC1155 overrides

    function onERC721Received(
        address, // operator,
        address, // from
        uint256, // tokenId,
        bytes calldata data
    ) external returns (bytes4) {
        if (data.length == 0) {
            return this.onERC721Received.selector;
        }

        bytes4 selector = bytes4(data[:4]);
        if (selector != this.singleERC721BidFill.selector) {
            revert UnexpectedSelector();
        }

        (bool success, ) = address(this).call(data);
        if (!success) {
            revert UnsuccessfulFill();
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
        if (data.length == 0) {
            return this.onERC1155Received.selector;
        }

        bytes4 selector = bytes4(data[:4]);
        if (selector != this.singleERC1155BidFill.selector) {
            revert UnexpectedSelector();
        }

        (bool success, ) = address(this).call(data);
        if (!success) {
            revert UnsuccessfulFill();
        }

        return this.onERC1155Received.selector;
    }
}
