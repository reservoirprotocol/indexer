// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {ISeaport} from "../interfaces/ISeaport.sol";

// One way to stay approval-less is to use one-time Seaport orders
// that effectively act as gifts. These are prone to front-running
// though. To prevent this, all such approval orders should ensure
// the offerer matches the transaction's sender (eg. `tx.origin`).
// Although relying on `tx.origin` is considered bad practice, the
// validity time of these orders should be in the range of minutes
// so that the risk of reusing them via a malicious contract which
// forwards them is low.
contract SeaportApprovalOrderZone {
    // --- Errors ---

    error Unauthorized();

    // --- Seaport `ZoneInterface` overrides ---

    function isValidOrder(
        bytes32,
        address,
        address offerer,
        bytes32
    ) external view returns (bytes4 validOrderMagicValue) {
        if (offerer != tx.origin) {
            revert Unauthorized();
        }

        validOrderMagicValue = this.isValidOrder.selector;
    }

    function isValidOrderIncludingExtraData(
        bytes32,
        address,
        ISeaport.AdvancedOrder calldata order,
        bytes32[] calldata,
        ISeaport.CriteriaResolver[] calldata
    ) external view returns (bytes4 validOrderMagicValue) {
        if (order.parameters.offerer != tx.origin) {
            revert Unauthorized();
        }

        validOrderMagicValue = this.isValidOrder.selector;
    }
}
