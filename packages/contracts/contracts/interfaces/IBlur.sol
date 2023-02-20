// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

interface IBlur {
    enum Side {
        Buy,
        Sell
    }

    enum AssetType {
        ERC721,
        ERC1155
    }

    enum SignatureVersion {
        Single,
        Bulk
    }

    struct Fee {
        uint16 rate;
        address payable recipient;
    }

    struct Order {
        address trader;
        Side side;
        address matchingPolicy;
        IERC165 collection;
        uint256 tokenId;
        uint256 amount;
        address paymentToken;
        uint256 price;
        uint256 listingTime;
        uint256 expirationTime;
        Fee[] fees;
        uint256 salt;
        bytes extraParams;
    }

    struct Input {
        Order order;
        uint8 v;
        bytes32 r;
        bytes32 s;
        bytes extraSignature;
        SignatureVersion signatureVersion;
        uint256 blockNumber;
    }

    function execute(Input calldata sell, Input calldata buy) external payable;
}
