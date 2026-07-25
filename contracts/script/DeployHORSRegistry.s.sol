// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {HORSRegistry} from "../src/HORSRegistry.sol";

contract DeployHORSRegistry is Script {
    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");

        console2.log("Deployer:", vm.addr(deployerKey));
        console2.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerKey);

        HORSRegistry registry = new HORSRegistry();

        vm.stopBroadcast();

        console2.log("HORSRegistry deployed at:", address(registry));
    }
}
