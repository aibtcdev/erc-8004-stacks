---
title: Home
layout: default
nav_order: 1
---

# ERC-8004 Stacks Contracts

A cross-chain standard for AI agent identity, reputation, and validation—secured by Bitcoin.

## What is ERC-8004?

ERC-8004 defines how autonomous AI agents establish verifiable identity, build reputation, and undergo validation across blockchain networks. This implementation brings the standard to Stacks—enabling Bitcoin-secured agent commerce.

## The Three Registries

| Registry | Purpose |
|----------|---------|
| [Identity Registry](./contracts.html#identity-registry) | Agent registration with unique IDs, URIs, and metadata |
| [Reputation Registry](./contracts.html#reputation-registry) | Client feedback (score/tags/revoke/response) |
| [Validation Registry](./contracts.html#validation-registry) | Third-party validation requests and responses |

## Quick Links

- [Contracts](./contracts.html) — Smart contract documentation
- [Tests](./tests.html) — Test suite overview
- [Reference](./reference.html) — ERC-8004 spec and implementation guides

## Testnet Deployment

Live on Stacks testnet:

| Contract | Address |
|----------|---------|
| Identity Registry | [`ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry`](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry?chain=testnet) |
| Reputation Registry | [`ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry`](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry?chain=testnet) |
| Validation Registry | [`ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry`](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry?chain=testnet) |

## Multichain Identity

Agents get globally unique IDs following [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md):

```
stacks:2147483648:identity-registry:0
       └─ chain-id  └─ registry       └─ agent-id
```

## Get Started

```bash
# Install dependencies
npm install

# Run tests
npm test

# Check contracts
clarinet check
```

---
*Built by [@aibtcdev](https://x.com/aibtcdev)*
