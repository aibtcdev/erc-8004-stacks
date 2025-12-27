# ERC-8004 Stacks Contracts

Minimal, compilable **ERC-8004** (Agent Identity/Reputation/Validation) contracts for **Stacks** (Clarity).

- **IdentityRegistry**: ERC-721-like agent registration (sequential IDs, URI, metadata).
- **ReputationRegistry**: Client feedback (score/tags/revoke/response).
- **ValidationRegistry**: Validator requests/responses.

**Status**: Identity ✅ (tested/deploy-ready). Reputation/Validation ⏳ (next).

**Multichain**: `stacks:<chainId>:<registry>:<agentId>` (CAIP-2 compliant).

Mirrors [erc8004-contracts](https://github.com/erc8004-org/erc8004-contracts) (Solidity).

## Contracts

| Name                  | Path                              | Status | Summary                                      |
|-----------------------|-----------------------------------|--------|----------------------------------------------|
| Identity Registry     | `contracts/identity-registry.clar`| ✅ Done| Agent registration (ERC-721 equiv., metadata)|
| Reputation Registry   | `contracts/reputation-registry.clar` | ⏳   | Feedback (score/tags/revoke/response)       |
| Validation Registry   | `contracts/validation-registry.clar`  | ⏳   | Validator requests/responses                 |

**Testnet Addresses** (Hiro Testnet, post-deploy):

| Contract              | Address                  |
|-----------------------|--------------------------|
| Identity Registry     | `ST...` (TBD)            |
| Reputation Registry   | `ST...` (TBD)            |
| Validation Registry   | `ST...` (TBD)            |

## Contract Specifications & Plan

- [Implementation Plan](docs/STACKS_ERC8004_IMPLEMENTATION.md)
- [Clarity Reference](docs/CLARITY_REFERENCE.md)
- [Solidity Refs](docs/erc8004-contracts-*.sol)

## Quickstart

### Install & Test

```bash
npm install
npm test          # Vitest + Clarinet (identity-registry full coverage)
clarinet test     # Clarinet-only
```

### Local Dev (Clarinet)

```bash
clarinet integrate # Dev shell
clarinet deploy    # Simnet
clarinet console   # REPL
```

### Deploy Hiro Testnet

1. `cp settings/Devnet.toml settings/Testnet.toml`
2. Update `Testnet.toml` w/ deployer keys.
3. `clarinet deploy --network testnet`
4. Update addresses above.

**Tests**:
- `tests/identity-registry.test.ts` ✅
- `tests/reputation-registry.test.ts` ⏳
- `tests/validation-registry.test.ts` ⏳
- `tests/erc8004-integration.test.ts` ⏳

## Resources

- **[ERC-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004)**: Agent standards.
- **[Clarity Manual](https://docs.stacks.co/clarity)**: Language.
- **[Clarinet](https://docs.clarinet.dev)**: Dev tools.
- **[Solidity Impl](https://github.com/erc8004-org/erc8004-contracts)**: Ethereum ref.
- **[Solana Impl](docs/solana-s8004-contract.rs)**: Rust ref.
- **[Plan](docs/STACKS_ERC8004_IMPLEMENTATION.md)**: Roadmap.

**Next**: Reputation/Validation impl → full testnet deploy → multichain demo.
