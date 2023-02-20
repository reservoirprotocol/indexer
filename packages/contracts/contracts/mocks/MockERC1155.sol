// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";

contract MockERC1155 is ERC1155 {
    constructor() ERC1155("https://mock.com") {}

    function mint(uint256 tokenId) external {
        _mint(msg.sender, tokenId, 1, "");
    }

    function mintMany(uint256 tokenId, uint256 amount) external {
        _mint(msg.sender, tokenId, amount, "");
    }
}
