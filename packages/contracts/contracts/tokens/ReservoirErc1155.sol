// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract ReservoirErc1155 is ERC1155, Ownable {
    using Strings for uint256;

    constructor(string memory _uri) ERC1155(_uri) {}

    function mint(uint256 tokenId, uint256 amount) external {
        _mint(msg.sender, tokenId, amount, "");
    }

    function uri(uint256 tokenId)
        public
        view
        virtual
        override
        returns (string memory)
    {
        return string(abi.encodePacked(super.uri(tokenId), tokenId.toString()));
    }

    function updateURI(string memory _uri) external onlyOwner {
        _setURI(_uri);
    }
}
