// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IZeroExV4 {
    struct Property {
        address propertyValidator;
        bytes propertyData;
    }

    struct Fee {
        address recipient;
        uint256 amount;
        bytes feeData;
    }

    struct ERC721Order {
        uint8 direction;
        address maker;
        address taker;
        uint256 expiry;
        uint256 nonce;
        IERC20 erc20Token;
        uint256 erc20TokenAmount;
        Fee[] fees;
        IERC721 erc721Token;
        uint256 erc721TokenId;
        Property[] erc721TokenProperties;
    }

    struct ERC1155Order {
        uint8 direction;
        address maker;
        address taker;
        uint256 expiry;
        uint256 nonce;
        IERC20 erc20Token;
        uint256 erc20TokenAmount;
        Fee[] fees;
        IERC1155 erc1155Token;
        uint256 erc1155TokenId;
        Property[] erc1155TokenProperties;
        uint128 erc1155TokenAmount;
    }

    struct Signature {
        uint8 signatureType;
        uint8 v;
        bytes32 r;
        bytes32 s;
    }

    function buyERC721(
        ERC721Order calldata sellOrder,
        Signature calldata signature,
        bytes memory callbackData
    ) external payable;

    function batchBuyERC721s(
        ERC721Order[] calldata sellOrders,
        Signature[] calldata signatures,
        bytes[] calldata callbackData,
        bool revertIfIncomplete
    ) external payable returns (bool[] memory);

    function sellERC721(
        ERC721Order calldata buyOrder,
        Signature calldata signature,
        uint256 erc721TokenId,
        bool unwrapNativeToken,
        bytes memory callbackData
    ) external;

    function buyERC1155(
        ERC1155Order calldata sellOrder,
        Signature calldata signature,
        uint128 erc1155BuyAmount,
        bytes calldata callbackData
    ) external payable;

    function batchBuyERC1155s(
        ERC1155Order[] calldata sellOrders,
        Signature[] calldata signatures,
        uint128[] calldata erc1155FillAmounts,
        bytes[] calldata callbackData,
        bool revertIfIncomplete
    ) external payable returns (bool[] memory successes);

    function sellERC1155(
        ERC1155Order calldata buyOrder,
        Signature calldata signature,
        uint256 erc1155TokenId,
        uint128 erc1155SellAmount,
        bool unwrapNativeToken,
        bytes calldata callbackData
    ) external;
}
