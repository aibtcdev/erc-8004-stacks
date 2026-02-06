# Stacks ERC-8004 Implementation Plan

## Revised Purpose of the Repo

**Core Goal**: Implement **ERC-8004 Stacks Edition** as a **chain singleton** (one deployment per Stacks network: mainnet/testnet), fully compatible with the multichain agent ID namespace (`stacks:<chainId>:<registry>:<agentId>`). This positions Stacks alongside Ethereum (Solidity) and Solana (Rust) as a first-class ERC-8004 chain. No distractions like custom wallets (`agent-account-example`), owner-agent mappings (`owner-agent-registry`), or stubs (`registry-addon-attestation`)—pure spec compliance for **Identity**, **Reputation**, and **Validation Registries**.

- **Why?** ERC-8004 docs emphasize per-chain singletons for discovery/trust. Stacks agents get portable IDs, reputation/validation signals. Off-chain indexers/subgraphs crawl via events/URIs.
- **Repo Name**: Rename to `erc8004-stacks-contracts` (or `erc8004-contracts-stacks`) to mirror `erc8004-contracts` (Solidity).
- **Output**: Testnet deployments + README with addresses (like Solidity README). Live demo agents/feedback.

**Key Adaptations for Clarity/Stacks**:

- **No ERC-721**: Use sequential `agentId` (u64, incremental via data-var), maps for ownership/URI/metadata. Events for indexing.
- **Signatures**: Flexible verification—**signed message** (Clarity `secp256k1-recover-public-key` on EIP-191-style hash) **or public function call** (agent pre-calls to authorize). STX txs are cheap/fast, so both viable. Follow Clarity conventions (e.g., `print` events, `string-utf8`, `buff` hashes).
- **Permissions**: Owner/operator via principal maps (like `isApprovedForAll`).
- **Storage**: Maps mirror Solidity (e.g., `agentId => client => index => Feedback`).
- **Events**: `print` structured payloads for indexing (e.g., `NewFeedback`).
- **Testing**: **100% coverage** with Clarinet/Vitest.

## High-Level Plan

**Status**: All three contracts ✅ Implemented & Tested (125 tests passing). **v2.0.0 spec-compliant**.

1. **Three Contracts** (modular, each refs `identity-registry` via cross-calls):
   | Contract | Status | Purpose | Key Maps/Functions |
   |----------|--------|---------|--------------------|
   | `identity-registry.clar` | ✅ Done | Agent registration (ERC-721 equiv.) | `owners: {agent-id: uint} → principal`, `uris: {agent-id: uint} → (string-utf8 512)`, `metadata: {agent-id: uint, key: (string-utf8 128)} → (buff 512)`, `approvals: {agent-id: uint, operator: principal} → bool`<br>`register() → uint`, `register-with-uri((string-utf8 512)) → uint`, `register-full((string-utf8 512), (list 10 {key: (string-utf8 128), value: (buff 512)})) → uint agentId`, `owner-of(uint) → (optional principal)`, `get-uri(uint) → (optional (string-utf8 512))`, `set-agent-uri(uint, (string-utf8 512)) → (response bool uint)`, `set-metadata(uint, (string-utf8 128), (buff 512)) → (response bool uint)`, `set-approval-for-all(uint, principal, bool) → (response bool uint)`, `is-approved-for-all(uint, principal) → bool`, `get-version() → (string-utf8 8)` |
   | `reputation-registry.clar` | ✅ Done | Feedback (score/tags/revoke/response) | Dual auth: SIP-018 signatures + on-chain approval. `feedback: {agent-id, client, index} → {score, tag1, tag2, is-revoked}`, `approved-clients: {agent-id, client} → index-limit`<br>`approve-client`, `give-feedback`, `give-feedback-signed`, `revoke-feedback`, `append-response`, `get-summary`, `read-feedback` |
   | `validation-registry.clar` | ✅ Done | Validator requests/responses | `validations: (buff 32) → {validator, agent-id, response, response-hash, tag, last-update}`, `agent-validations: {agent-id} → (list 1024 (buff 32))`<br>`validation-request`, `validation-response`, `get-validation-status`, `get-summary`, `get-agent-validations`, `get-validator-requests` |

2. **Deployment**:

   - **Testnet First**: Hiro Testnet (chainId via `chain-id`).
   - Singleton: Owner multisig/timelock post-deploy (no upgrades needed).
   - Clarinet deploy scripts + `settings/Devnet.toml` / `settings/Testnet.toml`.

3. **Multichain ID**: `stacks:<chainId>:<identityRegistry>:<agentId>` in agent JSON `registrations[]`. Per CAIP-2: Mainnet `stacks:1`, Testnet `stacks:2147483648`.

4. **Gas/Storage Learnings**: Fixed `string-utf8 512`/`buff 512`, `list 10` batch limits, `fold` for batch inserts (atomic), paginated reads (e.g., `list 10` per page), `uint` everywhere (no `u64`—Clarity `uint` is fine).

## Implementation Status

**All contracts complete with 151 tests passing. v2.0.0 spec-compliant.**

| Component | Status | Tests | Version |
|-----------|--------|-------|---------|
| `identity-registry.clar` | ✅ Done | 35 tests | 2.0.0 |
| `validation-registry.clar` | ✅ Done | 23 tests | 2.0.0 |
| `reputation-registry.clar` | ✅ Done | 51 tests | 2.0.0 |
| Integration tests | ✅ Done | 22 tests | - |
| Stress tests | ✅ Done | 20 tests | - |

### Completed Features

**v2.0.0 Breaking Changes**:
- **Identity as NFT**: Migrated from manual ownership map to Clarity's native `define-non-fungible-token`
  - Implements SIP-009 trait: `transfer`, `get-owner`, `get-last-token-id`, `get-token-uri`
  - Wallet visibility, explorer integration, standard transfer events
- **Agent Wallet**: Reserved metadata key `"agentWallet"`, auto-set on register
  - Dual-path change: tx-sender (wallet proves ownership) or SIP-018 (owner provides signature)
  - Cleared on transfer to prevent stale wallet associations
- **Signed Values**: Reputation score -> value (int) + value-decimals (uint 0-18)
  - WAD (18-decimal) normalization in getSummary with mode-based scaling
  - Supports negative feedback, high-precision ratings
- **Permissionless Feedback**: No approval required, self-feedback blocked via cross-contract check
  - Three authorization paths: permissionless, on-chain approval, SIP-018 signed
  - `is-authorized-or-owner` public read-only for cross-contract checks
- **String Tags**: Migrated from `(buff 32)` to `(string-utf8 64)` for semantic filtering
  - Both reputation (tag1, tag2) and validation (single tag)
  - Empty string = no filter (replaces zero-hash pattern)
- **Progressive Validation**: Multiple `validation-response` calls per requestHash
  - Soft -> hard finality workflow (preliminary -> final scores)
  - No monotonic guard (response can decrease)

**Identity Registry**:
- Sequential IDs from 0, batch register-full w/ fold
- Approvals, metadata/URI updates
- Events via `print`, version 2.0.0
- Reserved key protection (ERR_RESERVED_KEY u1004)

**Validation Registry**:
- Cross-contract auth via identity-registry
- Request/response workflow with hash-based lookup
- Summary aggregation with string tag filtering
- Progressive responses with `has-response` flag

**Reputation Registry**:
- Three authorization paths: permissionless, approved, SIP-018 signed
- Self-feedback prevention (owner/operator cannot give feedback)
- Index-based rate limiting via approval limits
- Revocation, response tracking, WAD-normalized summary aggregation
- Endpoint field (emit-only, not stored on-chain)

## Deployment Status

**Testnet**: ✅ Deployed to `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18`

| Contract | Testnet Address |
|----------|-----------------|
| Identity Registry | [`ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry`](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry?chain=testnet) |
| Reputation Registry | [`ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry`](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry?chain=testnet) |
| Validation Registry | [`ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry`](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry?chain=testnet) |

## v2.0.0 Quest Completion

**Quest**: Upgrade from v1.0.0 to v2.0.0 spec compliance
**Status**: ✅ Complete (7 phases, 0-6)
**Result**: All breaking changes implemented, 151 tests passing (up from 73 at v1.0.0)

**Phases**:
- Phase 0: NFT migration + SIP-009 trait (4 commits, 81 tests)
- Phase 1: Agent wallet + isAuthorizedOrOwner (2 commits, 101 tests)
- Phase 2: Value/decimals + permissionless feedback (2 commits, 106 tests)
- Phase 3: String tags + endpoint + flexible filters (3 commits, 106 tests)
- Phase 4: WAD normalization + readAllFeedback (2 commits, 114 tests)
- Phase 5: Validation progressive + version bump (4 commits, 118 tests)
- Phase 6: Integration tests + docs (1 commit, 125 tests)

**Total**: 21 commits, 52 new tests, all 3 contracts at version 2.0.0

## SIP Review Feedback Implementation (2026-02-06)

Following SIP community review, six phases of improvements were implemented to address mainnet scalability and API consistency:

### Phase 1: Counter+Indexed-Map Migration

**Problem**: Original implementation used `(list N T)` stored in maps for growing lists (clients, responders, agent-validations, validator-requests). This hit capacity walls at fixed sizes and required O(n) list append operations.

**Solution**: Migrated all four lists to counter+indexed-map pattern:
- `client-count` + `client-at-index` (was `(list 1024 principal)`)
- `responder-count` + `responder-at-index` (was `(list 256 principal)`)
- `agent-validation-count` + `agent-validation-at-index` (was `(list 1024 (buff 32))`)
- `validator-request-count` + `validator-request-at-index` (was `(list 1024 (buff 32))`)

**Benefits**:
- O(1) append vs O(n)
- No capacity walls (grows indefinitely)
- Natural pagination with cursor-based reads
- Deduplication maps (`client-exists`, `responder-exists`) preserved

**Changes**: All list-returning functions now paginated with `(opt-cursor (optional uint))` parameter.

### Phase 2: Global Feedback Sequence + Page Size Reduction

**Problem**: `read-all-feedback` with optional client filter had unpredictable iteration cost (nested loops). Mainnet read-only calls limited to ~30 map reads, but page size was 50 items.

**Solution**:
1. **Global sequence index**: Added `last-global-index` and `global-feedback-index` maps to track feedback in creation order across all clients
   - Each feedback write adds 2 map entries (global pointer + client pointer)
   - Read-only iteration is O(page-size), predictable cost
2. **Reduced page sizes**: `FEEDBACK_PAGE_SIZE` and `PAGE_SIZE` reduced from 50 to 15
   - 15 items × 2 reads per item = 30 reads (at mainnet limit)
   - Prevents read-only execution failures on mainnet nodes
3. **New convenience function**: `get-agent-feedback-count` returns total feedback count for an agent

**Changes**:
- `read-all-feedback` no longer takes client list input (iterates globally)
- All paginated functions return `{items: (list 15 ...), cursor: (optional uint)}`
- Cursor value = offset for next page (e.g., `(some u15)` for page 2)

### Phase 3: API Consistency

**Problem**: Inconsistent tag matching (empty string vs optional), self-feedback guard paths varied.

**Solution**:
1. **Tag standardization**: `get-summary` now uses `(opt-tag1 (optional (string-utf8 64)))` matching `read-all-feedback` pattern
   - Empty string wildcards replaced with `(match tag filter-tag (is-eq ...) true)` pattern
2. **Self-feedback guard**: All three `give-feedback` variants now use cross-contract `is-authorized-or-owner` for consistency
   - Prevents owner/operator from giving feedback to their own agent
   - Uses `tx-sender` consistently (not `contract-caller`)

### Phase 4: Trait Definitions

**Problem**: No formal interface contracts for cross-contract conformance checking.

**Solution**: Created three trait files defining registry interfaces:
- `contracts/traits/identity-registry-trait.clar` (14 functions)
- `contracts/traits/reputation-registry-trait.clar` (6 functions)
- `contracts/traits/validation-registry-trait.clar` (2 functions)

**Hybrid approach**: Clarity traits require `(response ...)` return types. Public functions and response-wrapped read-only functions included in traits. Raw-return read-only functions (returning `optional`, `uint`, tuples) documented but not trait-enforced.

All three registries declare `(impl-trait .{trait}.{trait})` for compile-time signature verification.

### Phase 5: Execution Limit Testing

**Problem**: Needed verification that paginated functions complete within Clarinet/mainnet cost limits.

**Solution**: Added `tests/stress-tests.test.ts` with 20 tests covering low/mid/high scales:
- Reputation: `get-clients`, `get-responders`, `read-all-feedback`, `get-summary`
- Validation: `get-agent-validations`, `get-validator-requests`, `get-summary`
- All tests verify cursor-based pagination and data correctness

**Result**: All 151 tests passing (131 existing + 20 stress). Cost analysis via `npm run test:report` confirms functions stay within limits.

### Phase 6: Documentation

Updated all documentation (this file, CLAUDE.md, planning files) to reflect architectural changes.

## Next Steps

1. **Tag v2.0.0**: Git tag for v2.0.0 release
2. **Multichain Demo**: Create example agent with cross-chain registration
3. **PR to ERC-8004 org**: Submit Stacks implementation to upstream
4. **Mainnet Deploy**: Deploy to Stacks mainnet when ready

**Risks/Mitigations**:
- ✅ Loops: Fixed-size lists, pagination
- ✅ Sig recovery: Clarity `secp256k1-recover?` with SIP-018
- ✅ Cross-contract: Direct `contract-call?`
- ✅ Costs: Batch ops via fold, RO summaries loop <200
