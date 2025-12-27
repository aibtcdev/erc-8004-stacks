# Stacks Owner-Agent Registry

Minimal, modular contracts for owner-agent identity and interactions on Stacks. Inspired by ERC-8004 (Identity/Reputation/Validation Registries).

Core: One-to-one owner (bare principal) ↔ agent (contract) mappings with unique IDs.

Extensible via addons for reputation, attestations, payments (sBTC/x402).

## Contracts

| Name                       | Path                                        | Summary                                 |
| -------------------------- | ------------------------------------------- | --------------------------------------- |
| Owner-Agent Registry       | `contracts/owner-agent-registry.clar`       | Core identity mappings (ERC-8004-like). |
| Agent Account Example      | `contracts/agent-account-example.clar`      | Permissioned asset management demo.     |
| Registry Addon Attestation | `contracts/registry-addon-attestation.clar` | Stub for reputation/validations.        |

**Testnet Addresses** (Simnet/TBD):

- Owner-Agent Registry: `ST000...` (deploy via Clarinet)

## Contract Specifications

- [Owner-Agent Registry](contracts/owner-agent-registry.md)
- [Agent Account Example](contracts/agent-account-example.md)
- [Registry Addon Attestation](contracts/registry-addon-attestation.md)

### Usage

```bash
npm install
npm test  # Run Vitest/Clarinet tests
```

**Tests**: `tests/owner-agent-registry.test.ts` (core coverage).

**Deploy**: Use Clarinet simnet; update `Clarinet.toml` for mainnet.

## Key Resources

- [ERC-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004)
- [Stacks Docs](https://docs.stacks.co)
- [Clarity Reference](https://docs.stacks.co/reference/functions)
- [AIBTC](https://aibtc.com)
