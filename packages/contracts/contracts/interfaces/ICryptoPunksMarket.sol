// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ICryptoPunksMarket {
    function punkIndexToAddress(uint256 punkIndex)
        external
        view
        returns (address owner);

    function balanceOf(address owner) external view returns (uint256 balance);

    function transferPunk(address to, uint256 punkIndex) external;

    function buyPunk(uint256 punkIndex) external payable;

    function offerPunkForSaleToAddress(
        uint256 punkIndex,
        uint256 minSalePriceInWei,
        address to
    ) external;
}
