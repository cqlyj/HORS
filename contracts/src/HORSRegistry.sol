// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract HORSRegistry {
    // --- Enums (match hors-core TypeScript types) ---

    enum Origin {
        SameHuman,
        AnyHuman,
        Public
    }
    enum Assurance {
        None,
        Selfie,
        Identity
    }
    enum Executor {
        Local,
        ZeroG
    }

    // --- Structs ---
    // ServiceRecord packs owner (20 bytes) + policyVersion (8 bytes) into slot 0

    struct ServiceRecord {
        address owner;
        uint64 policyVersion;
        bytes32 humanOrigin;
        bytes32 policyStorageRoot;
        bytes32 policyContentHash;
        uint256 updatedAt;
    }

    // PolicyEntry packs 3 enums (3 bytes) after bytes32 in slot 1
    struct PolicyEntry {
        bytes32 functionHash;
        Origin origin;
        Assurance assurance;
        Executor executor;
    }

    // --- Storage ---

    mapping(bytes32 => ServiceRecord) public services;
    mapping(bytes32 => PolicyEntry[]) internal _policies;

    // --- Events ---

    event ServiceRegistered(bytes32 indexed serviceId, address indexed owner);
    event PolicyUpdated(bytes32 indexed serviceId, uint64 policyVersion);
    event OwnershipTransferred(
        bytes32 indexed serviceId,
        address indexed previousOwner,
        address indexed newOwner
    );

    // --- Custom Errors (gas-efficient, no revert strings) ---

    error NotOwner(bytes32 serviceId, address caller);
    error ServiceAlreadyRegistered(bytes32 serviceId);
    error ServiceNotFound(bytes32 serviceId);
    error EmptyPolicies();
    error ZeroAddress();

    // --- Modifiers ---

    modifier onlyOwner(bytes32 serviceId) {
        if (services[serviceId].owner != msg.sender) {
            revert NotOwner(serviceId, msg.sender);
        }
        _;
    }

    // --- External Functions ---

    /// @notice Register a new HORS service.
    /// serviceId = keccak256(abi.encodePacked(msg.sender, keccak256(bytes(ensName))))
    /// @param ensName The ENS name (used for serviceId derivation, not stored)
    /// @param humanOrigin The owner's AgentKit humanId (AgentBook-scoped nullifier)
    /// @param policyStorageRoot 0G Storage data root hash of the full policy manifest
    /// @param policyContentHash keccak256 of the plaintext policy manifest JSON
    /// @param entries Per-function policy entries
    /// @return serviceId The derived service identifier
    function registerService(
        string calldata ensName,
        bytes32 humanOrigin,
        bytes32 policyStorageRoot,
        bytes32 policyContentHash,
        PolicyEntry[] calldata entries
    ) external returns (bytes32 serviceId) {
        if (entries.length == 0) revert EmptyPolicies();

        serviceId = keccak256(
            abi.encodePacked(msg.sender, keccak256(bytes(ensName)))
        );

        if (services[serviceId].owner != address(0)) {
            revert ServiceAlreadyRegistered(serviceId);
        }

        services[serviceId] = ServiceRecord({
            owner: msg.sender,
            policyVersion: 1,
            humanOrigin: humanOrigin,
            policyStorageRoot: policyStorageRoot,
            policyContentHash: policyContentHash,
            updatedAt: block.timestamp
        });

        _setPolicies(serviceId, entries);

        emit ServiceRegistered(serviceId, msg.sender);
        emit PolicyUpdated(serviceId, 1);
    }

    /// @notice Atomic policy update: storage root + content hash + entries in one tx.
    function updatePolicy(
        bytes32 serviceId,
        bytes32 newStorageRoot,
        bytes32 newContentHash,
        PolicyEntry[] calldata entries
    ) external onlyOwner(serviceId) {
        if (entries.length == 0) revert EmptyPolicies();

        ServiceRecord storage record = services[serviceId];
        record.policyStorageRoot = newStorageRoot;
        record.policyContentHash = newContentHash;
        unchecked {
            record.policyVersion++;
        }
        record.updatedAt = block.timestamp;

        delete _policies[serviceId];
        _setPolicies(serviceId, entries);

        emit PolicyUpdated(serviceId, record.policyVersion);
    }

    /// @notice Transfer service ownership to a new address.
    function transferOwnership(
        bytes32 serviceId,
        address newOwner
    ) external onlyOwner(serviceId) {
        if (newOwner == address(0)) revert ZeroAddress();

        address previousOwner = services[serviceId].owner;
        services[serviceId].owner = newOwner;

        emit OwnershipTransferred(serviceId, previousOwner, newOwner);
    }

    // --- View Functions ---

    function getService(
        bytes32 serviceId
    ) external view returns (ServiceRecord memory) {
        if (services[serviceId].owner == address(0))
            revert ServiceNotFound(serviceId);
        return services[serviceId];
    }

    function getPolicies(
        bytes32 serviceId
    ) external view returns (PolicyEntry[] memory) {
        return _policies[serviceId];
    }

    function getPolicyCount(bytes32 serviceId) external view returns (uint256) {
        return _policies[serviceId].length;
    }

    // --- Internal ---

    function _setPolicies(
        bytes32 serviceId,
        PolicyEntry[] calldata entries
    ) internal {
        uint256 len = entries.length;
        for (uint256 i; i < len; ) {
            _policies[serviceId].push(entries[i]);
            unchecked {
                ++i;
            }
        }
    }
}
