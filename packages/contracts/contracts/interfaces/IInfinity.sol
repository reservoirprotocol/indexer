// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IInfinity {
    struct TokenInfo {
        uint256 tokenId;
        uint256 numTokens;
    }

    struct OrderItem {
        address collection;
        TokenInfo[] tokens;
    }

    struct MakerOrder {
        bool isSellOrder;
        address signer;
        uint256[] constraints;
        OrderItem[] nfts;
        address[] execParams;
        bytes extraParams;
        bytes sig;
    }

    function takeMultipleOneOrders(MakerOrder[] calldata makerOrders)
        external
        payable;

    function takeOrders(
        MakerOrder[] calldata makerOrders,
        OrderItem[][] calldata takerNfts
    ) external payable;
}
