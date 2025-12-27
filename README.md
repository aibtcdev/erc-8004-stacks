# Stacks Owner-Agent Registry

Minimal, modular contracts for owner-agent identity and interactions on Stacks. Inspired by ERC-8004 (Identity/Reputation/Validation Registries).

Core: One-to-one owner (bare principal) ↔ agent (contract) mappings with unique IDs.

Extensible via addons for reputation, attestations, payments (sBTC/x402).

## Contracts

| Name | Path | Summary |
|------|------|---------|
| Owner-Agent Registry | `contracts/owner-agent-registry.clar` | Core identity mappings (ERC-8004-like). |
| Agent Account Example | `contracts/agent-account-example.clar` | Permissioned asset management demo. |
| Registry Addon Attestation | `contracts/registry-addon-attestation.clar` | Stub for reputation/validations. |

**Testnet Addresses** (Simnet/TBD):

- Owner-Agent Registry: `ST000...` (deploy via Clarinet)

## Contract Specifications

- [Owner-Agent Registry](docs/owner-agent-registry.md)
- [Agent Account Example](docs/agent-account-example.md)
- [Registry Addon Attestation](docs/registry-addon-attestation.md)

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

**Key Resources**:

- AIBTC Platform: [https://aibtc.com](https://aibtc.com/?referrer=grok.com)
- ERC-8004 Spec: [https://eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004?referrer=grok.com)
- Stacks Docs: [https://docs.stacks.co](https://docs.stacks.co/?referrer=grok.com)
- Clarity Reference: [https://docs.stacks.co/reference/functions](https://docs.stacks.co/reference/functions?referrer=grok.com)

**Key Citations:**

- [AIBTC GitHub Organization](https://github.com/aibtcdev?referrer=grok.com)
- [ERC-8004: Trustless Agents](https://eips.ethereum.org/EIPS/eip-8004?referrer=grok.com)
- [Stacks Documentation](https://docs.stacks.co/?referrer=grok.com)
- [AIBTC Platform Overview](https://aibtc.com/?referrer=grok.com)
- [Clarity Smart Contracts on Stacks](https://docs.stacks.co/concepts/clarity/overview?referrer=grok.com)
