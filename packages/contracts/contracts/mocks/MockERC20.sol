// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
  constructor() ERC20("Mock", "MOCK") {}

  function mint(uint256 tokenId) external {
    _mint(msg.sender, tokenId);
  }
}
