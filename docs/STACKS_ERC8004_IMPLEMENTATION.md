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

**Status**: All three contracts ✅ Implemented & Tested (59 tests passing).

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

**All contracts complete with 59 tests passing.**

| Component | Status | Tests |
|-----------|--------|-------|
| `identity-registry.clar` | ✅ Done | 18 tests |
| `validation-registry.clar` | ✅ Done | 18 tests |
| `reputation-registry.clar` | ✅ Done | 23 tests |

### Completed Features

**Identity Registry**:
- Sequential IDs from 0, batch register-full w/ fold
- Approvals, metadata/URI updates
- Events via `print`, version support

**Validation Registry**:
- Cross-contract auth via identity-registry
- Request/response workflow with hash-based lookup
- Summary aggregation with tag filtering

**Reputation Registry**:
- Dual authorization: SIP-018 signatures + on-chain approval
- Self-feedback prevention (owner/operator cannot give feedback)
- Index-based rate limiting via approval limits
- Revocation, response tracking, summary aggregation

## Next Steps

1. **Deploy Testnet**: `clarinet deploy --network testnet`
2. **Update README**: Add deployed contract addresses
3. **Multichain Demo**: Create example agent with cross-chain registration
4. **PR to ERC-8004 org**: Submit Stacks implementation

**Risks/Mitigations**:
- ✅ Loops: Fixed-size lists, pagination
- ✅ Sig recovery: Clarity `secp256k1-recover?` with SIP-018
- ✅ Cross-contract: Direct `contract-call?`
- ✅ Costs: Batch ops via fold, RO summaries loop <200
