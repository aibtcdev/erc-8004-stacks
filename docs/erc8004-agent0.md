# ERC-8004

ERC-8004 is the Agent Identity Standard for Ethereum that enables discovering, choosing, and interacting with agents across organizational boundaries without pre-existing trust.

## What is ERC-8004?

ERC-8004 provides a standard way to represent AI agent identities on Ethereum using three core registries:

- **Identity Registry** - ERC-721 NFTs for unique agent identities
- **Reputation Registry** - Feedback and reputation tracking
- **Validation Registry** - Third-party validator attestations

This enables permissionless agent discovery, censorship-resistant identity, and interoperable trust signals across platforms.

## Specification

📖 **[Read the full ERC-8004 specification](https://eips.ethereum.org/EIPS/eip-8004)**

## Contracts

The official ERC-8004 contracts are maintained by the 8004 team:

🔗 **[ERC-8004 Contracts Repository](https://github.com/erc-8004/erc-8004-contracts)**

### Testnet Contract Addresses

#### ETH Sepolia

- **IdentityRegistry**: `0x8004a6090Cd10A7288092483047B097295Fb8847`
- **ReputationRegistry**: `0x8004B8FD1A363aa02fDC07635C0c5F94f6Af5B7E`
- **ValidationRegistry**: `0x8004CB39f29c09145F24Ad9dDe2A108C1A2cdfC5`

#### Base Sepolia

- **IdentityRegistry**: `0x8004AA63c570c570eBF15376c0dB199918BFe9Fb`
- **ReputationRegistry**: `0x8004bd8daB57f14Ed299135749a5CB5c42d341BF`
- **ValidationRegistry**: `0x8004C269D0A5647E51E121FeB226200ECE932d55`

## Contract Functions

### Identity Registry

**Registration Functions:**

- `register() → uint256 agentId`
- `register(string tokenUri) → uint256 agentId`
- `register(string tokenUri, MetadataEntry[] metadata) → uint256 agentId`

**Management Functions:**

- `setAgentUri(uint256 agentId, string newUri)`
- `setMetadata(uint256 agentId, string key, bytes value)`
- `getMetadata(uint256 agentId, string key) → bytes`

**ERC-721 Functions:**

- `approve(address to, uint256 tokenId)`
- `setApprovalForAll(address operator, bool approved)`
- `transferFrom(address from, address to, uint256 tokenId)`
- `safeTransferFrom(address from, address to, uint256 tokenId)`
- `safeTransferFrom(address from, address to, uint256 tokenId, bytes data)`

**View Functions:**

- `balanceOf(address owner) → uint256`
- `ownerOf(uint256 tokenId) → address`
- `getApproved(uint256 tokenId) → address`
- `isApprovedForAll(address owner, address operator) → bool`
- `tokenURI(uint256 tokenId) → string`
- `name() → string`
- `symbol() → string`
- `supportsInterface(bytes4 interfaceId) → bool`

**Admin Functions:**

- `owner() → address`
- `transferOwnership(address newOwner)`
- `renounceOwnership()`
- `upgradeToAndCall(address newImplementation, bytes data)`

### Reputation Registry

**Feedback Functions:**

- `giveFeedback(uint256 agentId, uint8 score, bytes32 tag1, bytes32 tag2, string feedbackUri, bytes32 feedbackHash, bytes feedbackAuth)`
- `revokeFeedback(uint256 agentId, uint64 feedbackIndex)`
- `appendResponse(uint256 agentId, address clientAddress, uint64 feedbackIndex, string responseUri, bytes32 responseHash)`

**Query Functions:**

- `readFeedback(uint256 agentId, address clientAddress, uint64 index) → (uint8 score, bytes32 tag1, bytes32 tag2, bool isRevoked)`
- `readAllFeedback(uint256 agentId, address[] clientAddresses, bytes32 tag1, bytes32 tag2, bool includeRevoked) → (address[] clients, uint8[] scores, bytes32[] tag1s, bytes32[] tag2s, bool[] revokedStatuses)`
- `getSummary(uint256 agentId, address[] clientAddresses, bytes32 tag1, bytes32 tag2) → (uint64 count, uint8 averageScore)`
- `getClients(uint256 agentId) → address[]`
- `getLastIndex(uint256 agentId, address clientAddress) → uint64`
- `getResponseCount(uint256 agentId, address clientAddress, uint64 feedbackIndex, address[] responders) → uint64 count`

**Admin Functions:**

- `getIdentityRegistry() → address`
- `owner() → address`
- `transferOwnership(address newOwner)`
- `renounceOwnership()`
- `upgradeToAndCall(address newImplementation, bytes data)`

### Validation Registry

**Validation Functions:**

- `validationRequest(address validatorAddress, uint256 agentId, string requestUri, bytes32 requestHash)`
- `validationResponse(bytes32 requestHash, uint8 response, string responseUri, bytes32 responseHash, bytes32 tag)`

**Query Functions:**

- `getValidationStatus(bytes32 requestHash) → (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, bytes32 tag, uint256 lastUpdate)`
- `getSummary(uint256 agentId, address[] validatorAddresses, bytes32 tag) → (uint64 count, uint8 avgResponse)`
- `getAgentValidations(uint256 agentId) → bytes32[]`
- `getValidatorRequests(address validatorAddress) → bytes32[]`
- `validations(bytes32) → (address validatorAddress, uint256 agentId, uint8 response, bytes32 responseHash, bytes32 tag, uint256 lastUpdate)`

**Admin Functions:**

- `getIdentityRegistry() → address`
- `owner() → address`
- `transferOwnership(address newOwner)`
- `renounceOwnership()`
- `upgradeToAndCall(address newImplementation, bytes data)`

## File Examples

### Registration File

```
{  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",  "name": "myAgentName",  "description": "A natural language description of the Agent",  "image": "https://example.com/agent-image.png",  "endpoints": [    {      "name": "MCP",      "endpoint": "https://api.example.com/mcp",      "version": "2025-06-18",      "mcpTools": [        "data_analysis",        "chart_generation",        "report_creation"      ],      "mcpPrompts": [        "prompt_1",        "prompt_2",        "prompt_3"      ],      "mcpResources": [        "resource_1",        "resource_2",        "resource_3"      ]    },    {      "name": "A2A",      "endpoint": "https://api.example.com/a2a",      "version": "0.30",      "a2aSkills": [        "skill_1",        "skill_2",        "skill_3"      ]    },    {      "name": "ENS",      "endpoint": "vitalik.eth",      "version": "v1"    },    {      "name": "DID",      "endpoint": "did:method:foobar",      "version": "v1"    },    {      "name": "agentWallet",      "endpoint": "eip155:1:0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7"    }  ],  "registrations": [    {      "agentId": 241,      "agentRegistry": "eip155:11155111:0x8004a6090Cd10A7288092483047B097295Fb8847"    }  ],  "supportedTrusts": [    "reputation",    "crypto-economic",    "tee-attestation"  ],  "active": true,  "x402support": true}
```

### Feedback File

```
{  "agentRegistry": "eip155:1:{identityRegistry}",  "agentId": 22,  "clientAddress": "eip155:1:{clientAddress}",  "createdAt": "2025-09-23T12:00:00Z",  "feedbackAuth": "...",  "score": 70,  "tag1": "foo",  "tag2": "bar",  "skill": "as-defined-by-A2A",  "context": "as-defined-by-A2A",  "task": "as-defined-by-A2A",  "capability": "tools",  "name": "Put the name of the MCP tool you liked!",  "proofOfPayment": {    "fromAddress": "0x00...",    "toAddress": "0x00...",    "chainId": "1",    "txHash": "0x00..."  }}
```

## Next Steps

- Learn about [Agent Configuration](https://sdk.ag0.xyz/2-usage/2-2-configure-agents/)
- Explore [Usage Examples](https://sdk.ag0.xyz/3-examples/3-1-quick-start/)
