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
contract SeaportV12ApprovalOrderZone {
    // --- Errors ---

    error Unauthorized();

    // --- Seaport `ZoneInterface` overrides ---

    function validateOrder(ISeaport.ZoneParameters calldata zoneParameters)
        external
        view
        returns (bytes4 validOrderMagicValue)
    {
        if (zoneParameters.offerer != tx.origin) {
            revert Unauthorized();
        }

        validOrderMagicValue = this.validateOrder.selector;
    }

    function getSeaportMetadata()
        external
        pure
        returns (string memory name, ISeaport.Schema[] memory schemas)
    {
        name = "Seaport Approval Order";
        schemas = new ISeaport.Schema[](0);
    }
}
