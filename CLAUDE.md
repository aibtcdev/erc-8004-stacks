# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ERC-8004 Stacks Contracts - Clarity smart contracts implementing the ERC-8004 agent identity/reputation/validation protocol for Stacks blockchain. Mirrors the [Solidity reference implementation](https://github.com/erc8004-org/erc8004-contracts).

**Current Status**: All three registries ✅ complete with 149 tests passing. v2.0.0 spec-compliant. Deployed to testnet.

## Commands

```bash
# Install dependencies
npm install

# Run all tests (Vitest + Clarinet SDK)
npm test

# Run tests with coverage and cost reports
npm run test:report

# Watch mode (auto-run tests on changes)
npm run test:watch

# Type-check Clarity contracts
clarinet check

# Interactive dev shell with REPL
clarinet integrate

# Clarity REPL console
clarinet console

# Deploy to testnet (after configuring settings/Testnet.toml)
clarinet deploy --network testnet
```

## Architecture

Three contracts implementing ERC-8004 spec as chain singletons:

| Contract | Purpose | Status |
|----------|---------|--------|
| `identity-registry.clar` | Agent identity as NFT (SIP-009), agent wallet (dual-path auth), metadata | ✅ v2.0.0 |
| `reputation-registry.clar` | Feedback with signed values (int + decimals), permissionless + self-feedback guard, string tags | ✅ v2.0.0 |
| `validation-registry.clar` | Progressive validation responses, string tags | ✅ v2.0.0 |

**v2.0.0 Features**:
- **NFT Identity**: Native Clarity NFT with SIP-009 trait (transfer, get-owner, get-last-token-id, get-token-uri)
- **Agent Wallet**: Reserved metadata key, auto-set on register, dual-path change (tx-sender or SIP-018), cleared on transfer
- **Signed Values**: Reputation value is `int` (-2^127 to 2^127-1) with `uint` decimals (0-18), WAD normalization via running totals (O(1))
- **Permissionless Feedback**: No approval required, self-feedback blocked via cross-contract check
- **String Tags**: UTF-8 tags (64 chars) in both reputation and validation for semantic filtering
- **Progressive Validation**: Multiple responses per request hash (soft -> hard finality)

**Multichain ID Format**: `stacks:<chainId>:<registry>:<agentId>` (CAIP-2 compliant)
- Mainnet: `stacks:1`
- Testnet: `stacks:2147483648`

## Clarity Conventions

**Error constants** use ranges per contract:
- Identity Registry: u1000-u1999
  - u1000: ERR_NOT_AUTHORIZED
  - u1001: ERR_AGENT_NOT_FOUND
  - u1002: ERR_AGENT_ALREADY_EXISTS
  - u1003: ERR_METADATA_SET_FAILED
  - u1004: ERR_RESERVED_KEY (agentWallet key protection)
  - u1005-u1008: Wallet-related errors
- Validation Registry: u2000-u2999
- Reputation Registry: u3000-u3999
  - u3000: ERR_NOT_AUTHORIZED
  - u3001: ERR_AGENT_NOT_FOUND
  - u3002: ERR_FEEDBACK_NOT_FOUND
  - u3003: ERR_ALREADY_REVOKED
  - u3004: ERR_INVALID_VALUE
  - u3005: ERR_SELF_FEEDBACK (owner/operator cannot give feedback)
  - u3011: ERR_INVALID_DECIMALS (must be 0-18)
  - u3012: ERR_EMPTY_CLIENT_LIST (obsolete - retained for compatibility)

```clarity
(define-constant ERR_NOT_AUTHORIZED (err u1000))
(define-constant ERR_RESERVED_KEY (err u1004))
(define-constant ERR_SELF_FEEDBACK (err u3005))
(define-constant ERR_INVALID_DECIMALS (err u3011))
```

**Events** follow SIP-019 pattern:
```clarity
(print {
  notification: "identity-registry/AgentRegistered",
  payload: { agent-id: agent-id, owner: tx-sender }
})
```

**Type constraints**:
- URI: `(string-utf8 512)`
- Metadata key: `(string-utf8 128)` (reserved: `"agentWallet"`)
- Metadata value: `(buff 512)`
- Max metadata entries per registration: 10
- Tags: `(string-utf8 64)` (reputation tag1, tag2; validation tag)
- Endpoint: `(string-utf8 512)` (emit-only, not stored)
- Reputation value: `int` (signed 128-bit, -2^127 to 2^127-1)
- Reputation decimals: `uint` (0-18, for value normalization)
- Agent wallet: `principal` (auto-set, dual-path change)

**Storage patterns**:
- Reputation feedback: `{value: int, value-decimals: uint, wad-value: int, tag1: (string-utf8 64), tag2: (string-utf8 64), is-revoked: bool}`
  - `wad-value`: WAD-normalized (18-decimal) value stored at write time for O(1) aggregation and exact revocation reversal
- Running totals enable O(1) summary queries without iteration (see Aggregation Architecture below)

**Key function signatures** (v2.0.0):
```clarity
;; Identity Registry
(define-public (register) (response uint uint))
(define-public (transfer (token-id uint) (sender principal) (recipient principal)) (response bool uint))
(define-read-only (owner-of (agent-id uint)) (optional principal))
(define-read-only (get-agent-wallet (agent-id uint)) (optional principal))
(define-public (set-agent-wallet-direct (agent-id uint)) (response bool uint))
(define-read-only (is-authorized-or-owner (spender principal) (agent-id uint)) (response bool uint))

;; Reputation Registry
(define-public (give-feedback
  (agent-id uint) (value int) (value-decimals uint)
  (tag1 (string-utf8 64)) (tag2 (string-utf8 64))
  (endpoint (string-utf8 512)) ;; emit-only
  (feedback-uri (string-utf8 512)) (feedback-hash (buff 32))
) (response uint uint))

(define-read-only (get-summary (agent-id uint))
  {count: uint, summary-value: int, summary-value-decimals: uint})
;; O(1) via running totals. Filtering by tags/clients is indexer concern.

(define-read-only (read-all-feedback
  (agent-id uint)
  (opt-tag1 (optional (string-utf8 64))) ;; optional tags for filtering
  (opt-tag2 (optional (string-utf8 64)))
  (include-revoked bool)
  (opt-cursor (optional uint)) ;; pagination via global sequence, page size 15
) {items: (list 15 {...}), cursor: (optional uint)})

(define-read-only (get-clients (agent-id uint) (opt-cursor (optional uint)))
  {clients: (list 15 principal), cursor: (optional uint)})

(define-read-only (get-responders
  (agent-id uint) (client principal) (index uint) (opt-cursor (optional uint)))
  {responders: (list 15 principal), cursor: (optional uint)})

(define-read-only (get-agent-feedback-count (agent-id uint)) uint)

(define-read-only (get-response-count
  (agent-id uint) (opt-client (optional principal))
  (opt-feedback-index (optional uint)) (opt-responders (optional (list 200 principal)))
  (opt-cursor (optional uint))
) {total: uint, cursor: (optional uint)})

;; Validation Registry
(define-public (validation-response
  (request-hash (buff 32)) (response uint)
  (response-uri (string-utf8 512)) (response-hash (buff 32))
  (tag (string-utf8 64)) ;; single tag
) (response bool uint))

(define-read-only (get-summary (agent-id uint))
  {count: uint, avg-response: uint})
;; O(1) via running totals. Filtering by tags/validators is indexer concern.

(define-read-only (get-agent-validations (agent-id uint) (opt-cursor (optional uint)))
  {validations: (list 15 (buff 32)), cursor: (optional uint)})

(define-read-only (get-validator-requests (validator principal) (opt-cursor (optional uint)))
  {requests: (list 15 (buff 32)), cursor: (optional uint)})
```

## Aggregation Architecture

**Design**: O(1) summary queries via running totals. Filtered queries (tags, clients) are indexer concerns.

**On-chain**:
- Running totals maintained in write path (`give-feedback*`, `validation-response`)
- `get-summary` reads a single map (agent-summary) for instant results
- Reputation: `{count: uint, wad-sum: int}` → average = wad-sum / count (18-decimal precision)
- Validation: `{count: uint, response-total: uint}` → average = response-total / count
- Per-feedback `wad-value` stored for exact revocation reversal

**Off-chain indexer**:
- SIP-019 events are source of truth (`NewFeedback`, `FeedbackRevoked`, `ValidationResponse`)
- Indexer reconstructs filtered views (by tag, client, validator)
- `FeedbackRevoked` enriched with `value` and `value-decimals` for full reconstruction
- No on-chain pagination for filtered queries (unbounded, indexer-only)

**Spec deviations** (platform-appropriate):
- `getSummary` simplified: no filter parameters (EVM spec includes `clientAddresses`, `tags`)
- Running totals instead of unbounded iteration (scalability for Clarity)
- Fixed WAD precision (u18 decimals) instead of mode-decimals (simpler, lossless)
- `FeedbackRevoked` event extended beyond EVM spec (indexer optimization)

## Testing

Tests use Vitest with `vitest-environment-clarinet`. Test file location: `tests/`.

**Test accounts** (from `settings/Devnet.toml`):
- `deployer`: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM`
- `wallet_1` through `wallet_8`: Available for testing

**Calling contract functions in tests**:
```typescript
import { Cl, uintCV, stringUtf8CV, bufferCV, tupleCV, listCV } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const address1 = accounts.get("wallet_1")!;

// Public function
const { result } = simnet.callPublicFn("identity-registry", "register", [], address1);
expect(result).toBeOk(uintCV(0n));

// Read-only function
const { result } = simnet.callReadOnlyFn("identity-registry", "owner-of", [uintCV(0n)], address1);
expect(result).toBeSome(Cl.principal(address1));
```

**Clarinet SDK matchers**: `toBeOk()`, `toBeErr()`, `toBeSome()`, `toBeNone()`, `toBeBool()`, `toBeUint()`

## Traits

Three trait contracts define interfaces for cross-contract conformance:

| Trait | Functions | Notes |
|-------|-----------|-------|
| `identity-registry-trait.clar` | 14 functions | All public functions + SIP-009 + is-authorized-or-owner. Requires `(response ...)` return types. |
| `reputation-registry-trait.clar` | 6 functions | All public state-changing functions (give-feedback, revoke-feedback, approve-client, append-response). |
| `validation-registry-trait.clar` | 2 functions | All public state-changing functions (validation-request, validation-response). |

**Implementation**: Each registry declares `(impl-trait .{trait-name}.{trait-name})` for compile-time verification.

**Hybrid approach**: Clarity traits require `(response ...)` returns, so raw-return read-only functions (returning `optional`, `uint`, tuples) are documented but not trait-enforced. This is a Clarity language constraint, not a design choice.

## Reference Documentation

- **GitHub Pages**: https://aibtcdev.github.io/erc-8004-stacks
- Implementation plan: `docs/STACKS_ERC8004_IMPLEMENTATION.md`
- Clarity language reference: `docs/CLARITY_REFERENCE.md`
- Solidity reference: `docs/erc8004-contracts-*.md`
- ERC-8004 spec: `docs/erc8004-proposal-text.md`
