// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface IX2Y2 {
    struct OrderItem {
        uint256 price;
        bytes data;
    }

    struct ERC721Pair {
        IERC721 token;
        uint256 tokenId;
    }

    struct ERC1155Pair {
        IERC1155 token;
        uint256 tokenId;
        uint256 amount;
    }

    struct Order {
        uint256 salt;
        address user;
        uint256 network;
        uint256 intent;
        uint256 delegateType;
        uint256 deadline;
        IERC20 currency;
        bytes dataMask;
        OrderItem[] items;
        bytes32 r;
        bytes32 s;
        uint8 v;
        uint8 signVersion;
    }

    struct SettleShared {
        uint256 salt;
        uint256 deadline;
        uint256 amountToEth;
        uint256 amountToWeth;
        address user;
        bool canFail;
    }

    struct Fee {
        uint256 percentage;
        address to;
    }

    enum Op {
        INVALID,
        COMPLETE_SELL_OFFER,
        COMPLETE_BUY_OFFER,
        CANCEL_OFFER,
        BID,
        COMPLETE_AUCTION,
        REFUND_AUCTION,
        REFUND_AUCTION_STUCK_ITEM
    }

    struct SettleDetail {
        Op op;
        uint256 orderIdx;
        uint256 itemIdx;
        uint256 price;
        bytes32 itemHash;
        address executionDelegate;
        bytes dataReplacement;
        uint256 bidIncentivePct;
        uint256 aucMinIncrementPct;
        uint256 aucIncDurationSecs;
        Fee[] fees;
    }

    struct RunInput {
        Order[] orders;
        SettleDetail[] details;
        SettleShared shared;
        bytes32 r;
        bytes32 s;
        uint8 v;
    }

    function run(RunInput calldata input) external payable;
}
