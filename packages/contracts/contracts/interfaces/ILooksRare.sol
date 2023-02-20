// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface ILooksRare {
    struct MakerOrder {
        bool isOrderAsk;
        address signer;
        IERC165 collection;
        uint256 price;
        uint256 tokenId;
        uint256 amount;
        address strategy;
        IERC20 currency;
        uint256 nonce;
        uint256 startTime;
        uint256 endTime;
        uint256 minPercentageToAsk;
        bytes params;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    struct TakerOrder {
        bool isOrderAsk;
        address taker;
        uint256 price;
        uint256 tokenId;
        uint256 minPercentageToAsk;
        bytes params;
    }

    function transferSelectorNFT() external view returns (address);

    function matchAskWithTakerBidUsingETHAndWETH(
        TakerOrder calldata takerBid,
        MakerOrder calldata makerAsk
    ) external payable;

    function matchAskWithTakerBid(
        TakerOrder calldata takerBid,
        MakerOrder calldata makerAsk
    ) external payable;

    function matchBidWithTakerAsk(
        TakerOrder calldata takerAsk,
        MakerOrder calldata makerBid
    ) external;
}

interface ILooksRareTransferSelectorNFT {
    function TRANSFER_MANAGER_ERC721() external view returns (address);

    function TRANSFER_MANAGER_ERC1155() external view returns (address);
}
