// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface IWyvernV23 {
    function registry() external view returns (address);

    function tokenTransferProxy() external view returns (address);

    function atomicMatch_(
        address[14] calldata addrs,
        uint256[18] calldata uints,
        uint8[8] calldata feeMethodsSidesKindsHowToCalls,
        bytes calldata calldataBuy,
        bytes calldata calldataSell,
        bytes calldata replacementPatternBuy,
        bytes calldata replacementPatternSell,
        bytes calldata staticExtradataBuy,
        bytes calldata staticExtradataSell,
        uint8[2] calldata vs,
        bytes32[5] calldata rssMetadata
    ) external payable;
}

interface IWyvernV23ProxyRegistry {
    function registerProxy() external;

    function proxies(address user) external view returns (address);
}
