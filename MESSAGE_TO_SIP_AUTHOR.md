# Message to SIP Author: ERC-8004 Agent Commerce Protocol on Stacks

This document provides comprehensive context and instructions for authoring a Stacks Improvement Proposal (SIP) to formalize ERC-8004 on Stacks.

## Executive Summary

Create a **Standard Track SIP** that:
1. Defines traits for three registries (Identity, Reputation, Validation)
2. Designates canonical singleton deployments for Stacks
3. Positions Stacks as an official ERC-8004 supported chain

---

## SIP Metadata

### Type
**Standard** (like SIP-009, SIP-010) - defines standard traits that agent registries MUST implement for interoperability.

### Authors
- **AIBTC** (build@aibtc.dev)
- **Tony** (@tony1908 on GitHub)
- Open for additional contributors

### Number
Request next available number (likely 032+). Do not request SIP-8004 to match ERC - follow standard sequential assignment.

### Suggested Title
"SIP-0XX: Agent Commerce Protocol (ERC-8004 Compatible)"

---

## Relationship to Existing SIPs

### Primary Dependency: SIP-018 (Signed Structured Data)
The Reputation Registry uses SIP-018 for off-chain signature authorization. Document this integration:

```clarity
;; SIP-018 constants from reputation-registry.clar
(define-constant SIP018_PREFIX 0x534950303138)  ;; "SIP018" in hex
(define-constant DOMAIN_NAME "reputation-registry")
(define-constant DOMAIN_VERSION "1.0.0")
```

The implementation creates structured data hashes with:
- Domain hash: `{name, version, chain-id}`
- Message hash: `{agent-id, client, index-limit, expiry, signer}`

### NOT SIP-009 (NFT Traits)
The Identity Registry does NOT use SIP-009 NFT traits. It uses direct maps for ownership rather than the NFT trait pattern. Document this design choice explicitly - agents are not NFTs in the Stacks implementation.

### SIP-019 (Notifications)
Events follow SIP-019 notification patterns:
```clarity
(print {
  notification: "identity-registry/Registered",
  payload: { agent-id: agent-id, owner: owner, ... }
})
```

---

## Relationship to ERC-8004

### Positioning
Both a **compatible implementation** AND an **extension** of ERC-8004:
- Compatible: Same three registries, same semantic model, same multichain ID format
- Extension: Stacks-specific patterns (SIP-018 auth, Clarity types, Bitcoin security)

### Coordination Status
- ERC-8004 authors have **not yet been contacted**
- Contracts are deployed to testnet and ready for coordination
- Next step: Reach out to ERC-8004 authors (Marco De Rossi, Davide Crapis, Jordan Ellis, Erik Reppel) to discuss Stacks as official supported chain

### Deviations from ERC-8004
**Minimal/intentional improvements:**
- Score range: ERC-8004 uses 0-100, Stacks uses 1-100 for feedback (verify in code)
- Uses SIP-018 instead of EIP-191/ERC-1271 for signature verification
- Uses `(buff 32)` for tags instead of `bytes32`
- Uses direct ownership maps instead of ERC-721 inheritance

---

## Technical Specification

### Contracts Overview

| Contract | Purpose | Error Range | Version |
|----------|---------|-------------|---------|
| `identity-registry` | Agent registration, URIs, metadata | u1000-u1999 | 1.0.0 |
| `validation-registry` | Validator requests/responses | u2000-u2999 | 1.0.0 |
| `reputation-registry` | Client feedback with SIP-018 auth | u3000-u3999 | 1.0.0 |

### Identity Registry

**Purpose:** Register agents with unique sequential IDs, URIs pointing to metadata, and custom key-value storage.

**Public Functions:**
```clarity
(define-public (register) (response uint uint))
(define-public (register-with-uri (token-uri (string-utf8 512))) (response uint uint))
(define-public (register-full
  (token-uri (string-utf8 512))
  (metadata-entries (list 10 {key: (string-utf8 128), value: (buff 512)}))
) (response uint uint))
(define-public (set-agent-uri (agent-id uint) (new-uri (string-utf8 512))) (response bool uint))
(define-public (set-metadata (agent-id uint) (key (string-utf8 128)) (value (buff 512))) (response bool uint))
(define-public (set-approval-for-all (agent-id uint) (operator principal) (approved bool)) (response bool uint))
```

**Read-Only Functions:**
```clarity
(define-read-only (owner-of (agent-id uint)) (optional principal))
(define-read-only (get-uri (agent-id uint)) (optional (string-utf8 512)))
(define-read-only (get-metadata (agent-id uint) (key (string-utf8 128))) (optional (buff 512)))
(define-read-only (is-approved-for-all (agent-id uint) (operator principal)) bool)
(define-read-only (get-version) (string-utf8 8))
```

**Error Constants:**
```clarity
(define-constant ERR_NOT_AUTHORIZED (err u1000))
(define-constant ERR_AGENT_NOT_FOUND (err u1001))
(define-constant ERR_AGENT_ALREADY_EXISTS (err u1002))
(define-constant ERR_METADATA_SET_FAILED (err u1003))
```

**Type Constraints:**
- URI: `(string-utf8 512)`
- Metadata key: `(string-utf8 128)`
- Metadata value: `(buff 512)`
- Max metadata entries per registration: 10

### Reputation Registry

**Purpose:** Clients submit feedback (0-100 score + tags). Agents can respond. Supports both on-chain approval and SIP-018 signature authentication.

**Public Functions:**
```clarity
(define-public (approve-client (agent-id uint) (client principal) (index-limit uint)) (response bool uint))
(define-public (give-feedback
  (agent-id uint)
  (score uint)
  (tag1 (buff 32))
  (tag2 (buff 32))
  (feedback-uri (string-utf8 512))
  (feedback-hash (buff 32))
) (response uint uint))
(define-public (give-feedback-signed
  (agent-id uint)
  (score uint)
  (tag1 (buff 32))
  (tag2 (buff 32))
  (feedback-uri (string-utf8 512))
  (feedback-hash (buff 32))
  (signer principal)
  (index-limit uint)
  (expiry uint)
  (signature (buff 65))
) (response uint uint))
(define-public (revoke-feedback (agent-id uint) (index uint)) (response bool uint))
(define-public (append-response
  (agent-id uint)
  (client principal)
  (index uint)
  (response-uri (string-utf8 512))
  (response-hash (buff 32))
) (response bool uint))
```

**Read-Only Functions:**
```clarity
(define-read-only (read-feedback (agent-id uint) (client principal) (index uint))
  (optional {score: uint, tag1: (buff 32), tag2: (buff 32), is-revoked: bool}))
(define-read-only (get-summary (agent-id uint) (opt-clients (optional (list 200 principal))) (opt-tag1 (optional (buff 32))) (opt-tag2 (optional (buff 32))))
  {count: uint, average-score: uint})
(define-read-only (get-last-index (agent-id uint) (client principal)) uint)
(define-read-only (get-clients (agent-id uint)) (optional (list 1024 principal)))
(define-read-only (get-response-count (agent-id uint) (client principal) (index uint) (responder principal)) uint)
(define-read-only (get-approved-limit (agent-id uint) (client principal)) uint)
(define-read-only (read-all-feedback ...) (list 50 {...}))
(define-read-only (get-responders (agent-id uint) (client principal) (index uint)) (optional (list 256 principal)))
(define-read-only (get-identity-registry) principal)
(define-read-only (get-auth-message-hash ...) (buff 32))  ;; For off-chain tooling
```

**Error Constants:**
```clarity
(define-constant ERR_NOT_AUTHORIZED (err u3000))
(define-constant ERR_AGENT_NOT_FOUND (err u3001))
(define-constant ERR_FEEDBACK_NOT_FOUND (err u3002))
(define-constant ERR_ALREADY_REVOKED (err u3003))
(define-constant ERR_INVALID_SCORE (err u3004))
(define-constant ERR_SELF_FEEDBACK (err u3005))
(define-constant ERR_INVALID_INDEX (err u3006))
(define-constant ERR_SIGNATURE_INVALID (err u3007))
(define-constant ERR_AUTH_EXPIRED (err u3008))
(define-constant ERR_INDEX_LIMIT_EXCEEDED (err u3009))
(define-constant ERR_EMPTY_URI (err u3010))
```

### Validation Registry

**Purpose:** Validators can approve/reject agents. Useful for compliance, capability verification, or curated directories.

**Public Functions:**
```clarity
(define-public (validation-request
  (validator principal)
  (agent-id uint)
  (request-uri (string-utf8 512))
  (request-hash (buff 32))
) (response bool uint))
(define-public (validation-response
  (request-hash (buff 32))
  (response uint)
  (response-uri (string-utf8 512))
  (response-hash (buff 32))
  (tag (buff 32))
) (response bool uint))
```

**Read-Only Functions:**
```clarity
(define-read-only (get-validation-status (request-hash (buff 32)))
  (optional {validator: principal, agent-id: uint, response: uint, response-hash: (buff 32), tag: (buff 32), last-update: uint}))
(define-read-only (get-summary (agent-id uint) (opt-validators (optional (list 200 principal))) (opt-tag (optional (buff 32))))
  {count: uint, avg-response: uint})
(define-read-only (get-agent-validations (agent-id uint)) (optional (list 1024 (buff 32))))
(define-read-only (get-validator-requests (validator principal)) (optional (list 1024 (buff 32))))
(define-read-only (get-identity-registry) principal)
```

**Error Constants:**
```clarity
(define-constant ERR_NOT_AUTHORIZED (err u2000))
(define-constant ERR_AGENT_NOT_FOUND (err u2001))
(define-constant ERR_VALIDATION_NOT_FOUND (err u2002))
(define-constant ERR_VALIDATION_EXISTS (err u2003))
(define-constant ERR_INVALID_VALIDATOR (err u2004))
(define-constant ERR_INVALID_RESPONSE (err u2005))
```

---

## Multichain Identity Format

### CAIP-2 Chain Identifiers
Stacks uses CAIP-2 compliant identifiers:

| Network | Chain ID | CAIP-2 Identifier |
|---------|----------|-------------------|
| Mainnet | 1 | `stacks:1` |
| Testnet | 2147483648 | `stacks:2147483648` |

### Full Agent Identifier Format
```
stacks:<chainId>:<registry>:<agentId>
```

Example: `stacks:2147483648:identity-registry:0`

### Document Both Formats
The SIP should show mapping between:
- Stacks native format: `stacks:1:identity-registry:42`
- ERC-8004 EIP-155 format: `eip155:<chainId>:<registry>:<agentId>`

Reference: Stacks CAIP-2 and CAIP-10 specifications.

---

## Deployments

### Testnet (Current)
| Contract | Address |
|----------|---------|
| Identity Registry | `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry` |
| Reputation Registry | `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry` |
| Validation Registry | `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry` |

### Mainnet (Planned)
Document testnet addresses in initial SIP draft. Update with mainnet addresses when deployed.

---

## Security Considerations

Document ALL of the following:

### 1. Sybil/Spam Attacks
- Feedback pre-authorization only partially mitigates spam
- Sybil attacks can inflate reputation of fake agents
- Mitigation: Filter by trusted client addresses, build reputation systems around reviewers

### 2. Signature Verification (SIP-018)
- Signatures use secp256k1 with SIP-018 structured data format
- Expiry timestamps prevent replay attacks
- Index limits prevent feedback spam from single authorization

### 3. Access Control
- Owner/operator pattern for all registries
- `set-approval-for-all` allows delegated management
- Self-feedback explicitly blocked (`ERR_SELF_FEEDBACK`)

### 4. Data Integrity
- On-chain hashes commit to off-chain data
- URIs may use IPFS (content-addressable) or HTTPS
- Cannot cryptographically guarantee advertised capabilities are functional

---

## Governance

### Contract Governance
**Immutable** - deployed contracts are final with no upgrade path.

If community requests governance, could consider multisig for future versions, but current design is intentionally immutable.

### Singleton Model
Three contracts deployed as chain singletons (one deployment per chain, like ENS on Ethereum).

---

## Use Cases to Highlight

### 1. Bitcoin Security
Agents registered on Stacks inherit Bitcoin's finality. Critical for high-value agent tasks.

### 2. Cross-Chain Agents
Agents can operate on both Ethereum and Stacks ecosystems with linked identities via the multichain ID format.

### 3. sBTC Commerce
Agent payment flows using sBTC for Bitcoin-native payments.

### 4. USDCx Support
Stablecoin payments for agent services.

---

## Activation Criteria

### Simple Testnet Period
1. SIP enters Draft status
2. Open for community comments
3. Minimum testnet period with documented usage
4. Community discussion on Stacks forum
5. Coordinate with ERC-8004 community

**No security audit required** for initial activation, but recommended for mainnet deployment.

---

## Backwards Compatibility

**None** - This is a new standard with no existing implementations to migrate.

---

## Required SIP Sections

Per SIP-000, include:

1. **Preamble** - Metadata (see above)
2. **Abstract** - High-level summary (max 5,000 words)
3. **Copyright** - CC0 waiver
4. **Introduction** - Problem statement (why agents need identity/reputation/validation on Stacks)
5. **Specification** - Full function signatures, error codes, events (see Technical Specification above)
6. **Related Work** - Reference ERC-8004, discuss why not SIP-009
7. **Backwards Compatibility** - N/A, new standard
8. **Activation** - Testnet period, community comments
9. **Reference Implementations** - Link to this repo

---

## Reference Links

### Primary
- [ERC-8004 Ethereum Spec](https://eips.ethereum.org/EIPS/eip-8004)
- [Solidity Reference Implementation](https://github.com/erc8004-org/erc8004-contracts)
- [This Repo (Stacks Implementation)](https://github.com/aibtcdev/erc8004-registry-stacks)

### Related
- [Solana Implementation (s8004)](https://github.com/Woody4618/s8004)
- [AIBTC Project](https://github.com/aibtcdev)
- [SIP-000: Stacks Improvement Proposal Process](https://github.com/stacksgov/sips/blob/main/sips/sip-000/sip-000-stacks-improvement-proposal-process.md)
- [SIP-018: Signed Structured Data](https://github.com/stacksgov/sips/blob/main/sips/sip-018/sip-018-signed-structured-data.md)
- [Stacks CAIP-2 Specification](https://github.com/ChainAgnostic/namespaces/tree/main/stacks)

### Stacks Ecosystem
- [Stacks Forum](https://forum.stacks.org/) - For community discussion
- [SIPs Repository](https://github.com/stacksgov/sips)

---

## Engagement Strategy

### Community First Approach
1. Post draft to Stacks forum for community feedback
2. Let community self-select to engage
3. No need to pre-coordinate with specific projects (Hiro, Foundation, etc.)

### ERC-8004 Coordination
1. Share testnet deployment with ERC-8004 authors
2. Request feedback on Stacks-specific design choices
3. Discuss official recognition of Stacks as supported chain
4. Consider co-authorship if appropriate

---

## Timeline Expectations

**Urgent with small incremental tasks:**
- Draft SIP structure: 1-2 days
- Fill in technical specification: 2-3 days
- Community review: Ongoing
- Total to Draft submission: ~1-2 weeks

Focus on progress through small, actionable steps rather than waiting for perfect complete draft.

---

## Test Suite

The implementation includes 73 passing tests. The SIP should reference these as validation of the specification.

```bash
npm test           # Run all tests
npm run test:report # Run with coverage
```

---

## Questions for SIP Author

Before starting, clarify:

1. Should traits be defined for each registry, or just document the singleton contracts?
2. What level of ERC-8004 compliance should be claimed? (Full? Partial? Extended?)
3. Should the Agent Registration File JSON schema be included in the SIP?

---

*Document prepared for SIP authorship. Contact build@aibtc.dev with questions.*
