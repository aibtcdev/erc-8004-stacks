# ERC-8004 Stacks Contracts

Clarity smart contracts implementing the [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) agent identity, reputation, and validation protocol for Stacks blockchain (v2.0.0).

Cross-chain standard — same protocol on [Ethereum](https://github.com/erc-8004/erc-8004-contracts) (Solidity), [Solana](https://github.com/Woody4618/s8004) (Rust), and Stacks (Clarity).

## Deployed Contracts

### Mainnet (`SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD`)

| Contract | Explorer |
|----------|----------|
| `identity-registry-v2` | [view](https://explorer.hiro.so/txid/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.identity-registry-v2?chain=mainnet) |
| `reputation-registry-v2` | [view](https://explorer.hiro.so/txid/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.reputation-registry-v2?chain=mainnet) |
| `validation-registry-v2` | [view](https://explorer.hiro.so/txid/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.validation-registry-v2?chain=mainnet) |
| `identity-registry-trait-v2` | [view](https://explorer.hiro.so/txid/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.identity-registry-trait-v2?chain=mainnet) |
| `reputation-registry-trait-v2` | [view](https://explorer.hiro.so/txid/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.reputation-registry-trait-v2?chain=mainnet) |
| `validation-registry-trait-v2` | [view](https://explorer.hiro.so/txid/SP1NMR7MY0TJ1QA7WQBZ6504KC79PZNTRQH4YGFJD.validation-registry-trait-v2?chain=mainnet) |

### Testnet (`ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18`)

| Contract | Explorer |
|----------|----------|
| `identity-registry-v2` | [view](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry-v2?chain=testnet) |
| `reputation-registry-v2` | [view](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry-v2?chain=testnet) |
| `validation-registry-v2` | [view](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry-v2?chain=testnet) |
| `identity-registry-trait-v2` | [view](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry-trait-v2?chain=testnet) |
| `reputation-registry-trait-v2` | [view](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry-trait-v2?chain=testnet) |
| `validation-registry-trait-v2` | [view](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry-trait-v2?chain=testnet) |

## Contracts

| Contract | Purpose |
|----------|---------|
| `identity-registry-v2` | Agent registration as SIP-009 NFT, metadata, agent wallet (dual-path auth) |
| `reputation-registry-v2` | Client feedback with signed values, permissionless + self-feedback guard |
| `validation-registry-v2` | Third-party validation requests with progressive responses |

Three trait contracts (`contracts/traits/*-v2.clar`) define interfaces for cross-contract conformance.

## Quickstart

```bash
npm install        # Install dependencies
npm test           # Run 149 tests (Vitest + Clarinet SDK)
clarinet check     # Type-check Clarity contracts
```

## Multichain Identity

Agents get globally unique IDs following [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md):

```
stacks:<chainId>:<registry>:<agentId>
```

- Mainnet: `stacks:1`
- Testnet: `stacks:2147483648`

## Documentation

- `CLAUDE.md` — Development guide, conventions, and architecture
- `AGENTS.md` — LLM-friendly contract API reference and integration guide

## Links

- [ERC-8004 Spec](https://eips.ethereum.org/EIPS/eip-8004)
- [Solidity Reference](https://github.com/erc-8004/erc-8004-contracts)
- [AIBTC](https://github.com/aibtcdev)
