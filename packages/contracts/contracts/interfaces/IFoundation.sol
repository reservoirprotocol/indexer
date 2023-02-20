// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IFoundation {
    function buyV2(
        IERC721 nftContract,
        uint256 tokenId,
        uint256 maxPrice,
        address referrer
    ) external payable;
}
