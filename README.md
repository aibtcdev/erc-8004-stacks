# ERC-8004 Stacks Contracts

Minimal, compilable **ERC-8004** (Agent Identity/Reputation/Validation) contracts for **Stacks** (Clarity).

- **IdentityRegistry**: ERC-721-like agent registration (sequential IDs, URI, metadata).
- **ReputationRegistry**: Client feedback (score/tags/revoke/response).
- **ValidationRegistry**: Validator requests/responses.

**Status**: All registries ✅ complete (tested/deploy-ready).

**Multichain**: `stacks:<chainId>:<registry>:<agentId>` (CAIP-2 compliant).

Mirrors [erc8004-contracts](https://github.com/erc8004-org/erc8004-contracts) (Solidity) and [s8004 contracts](https://github.com/Woody4618/s8004) (Solana).

## Contracts

| Name                | Path                                 | Status  | Summary                                       |
| ------------------- | ------------------------------------ | ------- | --------------------------------------------- |
| Identity Registry   | `contracts/identity-registry.clar`   | ✅ Done | Agent registration (ERC-721 equiv., metadata) |
| Reputation Registry | `contracts/reputation-registry.clar` | ✅ Done | Feedback (score/tags/revoke/response), SIP-018 signatures |
| Validation Registry | `contracts/validation-registry.clar` | ✅ Done | Validator requests/responses                  |

**Testnet Addresses** (Hiro Testnet, post-deploy):

| Contract            | Address       |
| ------------------- | ------------- |
| Identity Registry   | `ST...` (TBD) |
| Reputation Registry | `ST...` (TBD) |
| Validation Registry | `ST...` (TBD) |

## Contract Specifications & Plan

- [Implementation Plan](docs/STACKS_ERC8004_IMPLEMENTATION.md)
- [Clarity Reference](docs/CLARITY_REFERENCE.md)
- [Solidity Refs](docs/erc8004-contracts-*)
- [Solana Refs](docs/solana-s8004-*)

## Quickstart

### Install & Test

```bash
npm install
npm test          # Vitest + Clarinet (identity-registry full coverage)
```

### Local Dev (Clarinet)

```bash
clarinet integrate # Dev shell
clarinet console   # REPL
```

### Deploy Testnet

1. `cp settings/Devnet.toml settings/Testnet.toml`
2. Update `Testnet.toml` w/ deployer keys.
3. `clarinet deploy --network testnet`
4. Update addresses above.

**Tests**:

- `tests/identity-registry.test.ts` ✅ (18 tests)
- `tests/reputation-registry.test.ts` ✅ (23 tests)
- `tests/validation-registry.test.ts` ✅ (18 tests)
- `tests/erc8004-integration.test.ts` ✅ (14 tests)

## Resources

- **[ERC-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004)**: Agent standards.
- **[Clarity Reference](https://docs.stacks.co/reference/clarity)**: Language.
- **[Clarinet](https://www.hiro.so/clarinet)**: Dev tools.
- **[Solidity Impl](https://github.com/erc8004-org/erc8004-contracts)**: Ethereum ref.
- **[Solana Impl](docs/solana-s8004-contract.rs)**: Rust ref.
- **[Plan](docs/STACKS_ERC8004_IMPLEMENTATION.md)**: Roadmap.

**Next**: Testnet deploy → multichain demo.
