# AGENTS.md

> LLM-friendly reference for the ERC-8004 Stacks contracts. For development conventions, see `CLAUDE.md`.

## Overview

ERC-8004 is a cross-chain standard for AI agent identity, reputation, and validation. This repository implements v2.0.0 in Clarity for the Stacks blockchain.

Three singleton registry contracts, deployed once per chain:

- **Identity Registry** — Agent registration as SIP-009 NFT with metadata and agent wallet
- **Reputation Registry** — Client feedback with signed int values, WAD-normalized running totals
- **Validation Registry** — Third-party validation requests with progressive responses

### Deployed Contracts

**Mainnet** — deployer: `SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD`

| Contract ID | Type |
|-------------|------|
| `SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.identity-registry-v2` | Registry |
| `SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.reputation-registry-v2` | Registry |
| `SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.validation-registry-v2` | Registry |
| `SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.identity-registry-trait-v2` | Trait |
| `SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.reputation-registry-trait-v2` | Trait |
| `SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.validation-registry-trait-v2` | Trait |

**Testnet** — deployer: `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18`

| Contract ID | Type |
|-------------|------|
| `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry-v2` | Registry |
| `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry-v2` | Registry |
| `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry-v2` | Registry |
| `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry-trait-v2` | Trait |
| `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry-trait-v2` | Trait |
| `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry-trait-v2` | Trait |

## Discovery Chain

ERC-8004 is the on-chain foundation for the aibtc AX (Agent Experience) discovery chain. Understanding where it fits in the broader agent lifecycle helps explain why identity registration matters beyond contract mechanics.

### Lifecycle Position

The [Genesis Agent Lifecycle](https://github.com/aibtcdev/aibtc-mcp-server/blob/main/skill/references/genesis-lifecycle.md) defines six levels agents progress through before reaching active status:

```
L0 Unverified → L1 Registered → L2 Genesis → L3 On-Chain Identity → L4 Reputation → Active Agent
   (wallet)      (verified)       (airdrop)     (ERC-8004 register)   (bootstrapped)  (checking in)
```

ERC-8004 identity registration is **L3** in this lifecycle. An agent at L2 Genesis (has received a BTC airdrop) uses the `register_identity` MCP tool to write its Bitcoin and Stacks addresses to this registry — making the agent discoverable on-chain.

### Why Identity Comes Before Reputation

The identity registry is the prerequisite for reputation bootstrapping (L4). Reputation feedback (`give-feedback`) requires a registered agent-id from the identity registry. Without L3, agents cannot:
- Receive reputation signals from other agents or services
- Appear in AX discovery results (agents are ranked by lifecycle completion)
- Access trust-gated x402 endpoints that require verified on-chain identity

### MCP Tool Abstraction

Agents interacting with this registry through the [aibtc-mcp-server](https://github.com/aibtcdev/aibtc-mcp-server) do not need to call Clarity functions directly. The MCP tools abstract contract calls:

| MCP Tool | Contract Function | Lifecycle |
|----------|-------------------|-----------|
| `register_identity` | `identity-registry-v2.register` | L2 → L3 |
| `get_identity` | `identity-registry-v2.get-agent-wallet` + `owner-of` | Read L3 state |
| `give_feedback` | `reputation-registry-v2.give-feedback` | L3 → L4 |
| `get_reputation` | `reputation-registry-v2.get-summary` | Read L4 state |

### Cross-References

- **Genesis Lifecycle**: [genesis-lifecycle.md](https://github.com/aibtcdev/aibtc-mcp-server/blob/main/skill/references/genesis-lifecycle.md) — full L0–Active lifecycle with tool workflows
- **MCP Server**: [aibtc-mcp-server](https://github.com/aibtcdev/aibtc-mcp-server) — `register_identity`, `get_identity`, `give_feedback`, `get_reputation` tools
- **x402 Discovery**: Agents with L3+ identity are surfaced in x402-api and x402-sponsor-relay endpoint discovery

---

## Identity Registry (`identity-registry-v2`)

Agents are SIP-009 NFTs. Each agent gets a sequential uint ID, optional URI, key-value metadata, and an agent wallet (principal). Supports owner, operator (approval-for-all), and SIP-018 signature authorization.

### Registration

```clarity
;; Minimal registration (auto-assigns next agent-id)
(contract-call? .identity-registry-v2 register)
;; => (ok uint) — the new agent-id

;; With URI
(contract-call? .identity-registry-v2 register-with-uri u"https://example.com/agent.json")

;; With URI + metadata (up to 10 entries)
(contract-call? .identity-registry-v2 register-full
  u"https://example.com/agent.json"
  (list {key: u"name", value: 0x416c696365}))
```

### Agent Wallet

A reserved metadata key (`agentWallet`) auto-set to the registering principal. Two paths to change it:

```clarity
;; Direct: tx-sender must be owner or operator
(contract-call? .identity-registry-v2 set-agent-wallet-direct u0)

;; Signed: SIP-018 structured data signature from the current wallet holder
(contract-call? .identity-registry-v2 set-agent-wallet-signed u0 new-wallet deadline signature)

;; Remove wallet
(contract-call? .identity-registry-v2 unset-agent-wallet u0)
```

Agent wallet is cleared on NFT transfer.

### Read Functions

```clarity
(contract-call? .identity-registry-v2 owner-of u0)           ;; => (optional principal)
(contract-call? .identity-registry-v2 get-uri u0)             ;; => (optional (string-utf8 512))
(contract-call? .identity-registry-v2 get-metadata u0 u"key") ;; => (optional (buff 512))
(contract-call? .identity-registry-v2 get-agent-wallet u0)    ;; => (optional principal)
(contract-call? .identity-registry-v2 is-authorized-or-owner sender u0) ;; => (response bool uint)
(contract-call? .identity-registry-v2 get-version)            ;; => (string-utf8 6)
```

### SIP-009 NFT Functions

```clarity
(contract-call? .identity-registry-v2 get-last-token-id)      ;; => (response uint uint)
(contract-call? .identity-registry-v2 get-token-uri u0)        ;; => (response (optional (string-utf8 512)) uint)
(contract-call? .identity-registry-v2 get-owner u0)            ;; => (response (optional principal) uint)
(contract-call? .identity-registry-v2 transfer u0 sender recipient) ;; => (response bool uint)
```

### Events (SIP-019)

| Event | When |
|-------|------|
| `identity-registry/Registered` | New agent registered |
| `identity-registry/MetadataSet` | Metadata key updated |
| `identity-registry/UriUpdated` | Agent URI changed |
| `identity-registry/Transfer` | NFT transferred |
| `identity-registry/ApprovalForAll` | Operator approval changed |

## Reputation Registry (`reputation-registry-v2`)

Feedback uses signed int values with configurable decimals (0-18). Internally normalized to WAD (18 decimals) for O(1) summary aggregation. Three feedback paths: permissionless, pre-approved, and SIP-018 signed.

### Giving Feedback

```clarity
;; Permissionless (anyone except agent owner/operator)
(contract-call? .reputation-registry-v2 give-feedback
  u0              ;; agent-id
  42              ;; value (int, signed)
  u2              ;; value-decimals (0-18)
  u"reliable"     ;; tag1 (string-utf8 64)
  u"fast"         ;; tag2 (string-utf8 64)
  u"https://api.example.com" ;; endpoint (emitted only, not stored)
  u"https://example.com/feedback.json" ;; feedback-uri
  0x0000000000000000000000000000000000000000000000000000000000000000 ;; feedback-hash
)
;; => (ok uint) — feedback index for this client

;; Pre-approved path (agent owner pre-approves a client with index limit)
(contract-call? .reputation-registry-v2 approve-client u0 client-principal u10)
(contract-call? .reputation-registry-v2 give-feedback-approved ...)

;; SIP-018 signed path (structured data signature from agent wallet)
(contract-call? .reputation-registry-v2 give-feedback-signed ... signer index-limit expiry signature)
```

Self-feedback blocked: `tx-sender` cannot be the agent's owner or operator.

### Revoking and Responding

```clarity
;; Revoke feedback (only the original feedback giver)
(contract-call? .reputation-registry-v2 revoke-feedback u0 u0)

;; Agent owner appends a response to feedback
(contract-call? .reputation-registry-v2 append-response u0 client u0 u"https://response.json" 0x...)
```

### Reading Feedback

```clarity
;; Single feedback entry
(contract-call? .reputation-registry-v2 read-feedback u0 client u0)
;; => (optional {value: int, value-decimals: uint, wad-value: int, tag1: ..., tag2: ..., is-revoked: bool})

;; Paginated feed (page size 14, cursor-based)
(contract-call? .reputation-registry-v2 read-all-feedback
  u0 (some u"reliable") none true (some u0))
;; => {items: (list 14 {...}), cursor: (optional uint)}

;; O(1) summary (running totals, no iteration)
(contract-call? .reputation-registry-v2 get-summary u0)
;; => {count: uint, summary-value: int, summary-value-decimals: uint}
;; summary-value-decimals is always u18 (WAD precision)

;; List clients who gave feedback
(contract-call? .reputation-registry-v2 get-clients u0 none)
;; => {clients: (list 14 principal), cursor: (optional uint)}

;; Response count
(contract-call? .reputation-registry-v2 get-response-count u0 none none none none)
;; => {total: uint, cursor: (optional uint)}
```

### Events (SIP-019)

| Event | When |
|-------|------|
| `reputation-registry/ClientApproved` | Client pre-approved for feedback |
| `reputation-registry/NewFeedback` | New feedback submitted |
| `reputation-registry/FeedbackRevoked` | Feedback revoked (includes value + decimals for indexer reconstruction) |
| `reputation-registry/ResponseAppended` | Agent response appended to feedback |

## Validation Registry (`validation-registry-v2`)

Validators respond to agent validation requests. Supports progressive responses (multiple calls per request hash with increasing finality).

### Submitting Requests and Responses

```clarity
;; Request validation (caller is the agent owner)
(contract-call? .validation-registry-v2 validation-request
  validator-principal u0 u"https://request.json" 0x...)
;; => (ok true)

;; Respond to validation (caller is the validator)
(contract-call? .validation-registry-v2 validation-response
  0x...              ;; request-hash
  u1                 ;; response (uint, application-defined meaning)
  u"https://report.json" ;; response-uri
  0x...              ;; response-hash
  u"compliance"      ;; tag (string-utf8 64)
)
;; => (ok true)
```

### Reading Validations

```clarity
;; Get validation status
(contract-call? .validation-registry-v2 get-validation-status 0x...)
;; => (optional {validator, agent-id, response, response-hash, tag, last-update, has-response})

;; O(1) summary
(contract-call? .validation-registry-v2 get-summary u0)
;; => {count: uint, avg-response: uint}

;; List an agent's validations (page size 14)
(contract-call? .validation-registry-v2 get-agent-validations u0 none)
;; => {validations: (list 14 (buff 32)), cursor: (optional uint)}

;; List a validator's requests
(contract-call? .validation-registry-v2 get-validator-requests validator none)
;; => {requests: (list 14 (buff 32)), cursor: (optional uint)}
```

### Events (SIP-019)

| Event | When |
|-------|------|
| `validation-registry/ValidationRequest` | New validation requested |
| `validation-registry/ValidationResponse` | Validator responded (or updated response) |

## Error Codes

| Range | Contract | Key Errors |
|-------|----------|------------|
| u1000-u1999 | Identity | u1000 NOT_AUTHORIZED, u1001 AGENT_NOT_FOUND, u1004 RESERVED_KEY |
| u2000-u2999 | Validation | u2000 NOT_AUTHORIZED, u2001 AGENT_NOT_FOUND |
| u3000-u3999 | Reputation | u3000 NOT_AUTHORIZED, u3005 SELF_FEEDBACK, u3011 INVALID_DECIMALS |

## Architecture Notes

- **Running totals**: `get-summary` is O(1) via pre-computed aggregates maintained in the write path. Filtered queries (by tag, client, validator) are off-chain indexer concerns via SIP-019 events.
- **Pagination**: All list reads use cursor-based pagination with page size 14 (fits within Stacks mainnet 30-read-call limit).
- **Authorization**: All functions use `tx-sender` for identity. Three auth levels: owner (tx-sender = owner), operator (approval-for-all), SIP-018 signature.
- **WAD normalization**: Reputation values normalized to 18 decimals at write time. Summary returns WAD precision. Per-feedback `wad-value` enables exact revocation reversal.
- **Cross-contract**: Reputation and validation registries call `identity-registry-v2.is-authorized-or-owner` for auth checks.
