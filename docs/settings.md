---
title: Settings
layout: default
nav_order: 4
---

[← Home](./index.html) | **Settings**

# Settings

> Clarinet configuration files for different deployment environments.

## Contents

| File | Purpose |
|------|---------|
| [`Devnet.toml`](https://github.com/aibtc/erc8004-registry-stacks/blob/master/settings/Devnet.toml) | Local development with test accounts |
| `Testnet.toml` | Testnet deployment (gitignored) |
| `Mainnet.toml` | Mainnet deployment (gitignored) |

## Devnet Configuration

The `Devnet.toml` file defines:
- Test wallet addresses and private keys
- Contract deployment order
- Local chain parameters

## Deployment

### Testnet

1. Copy the devnet config:
   ```bash
   cp settings/Devnet.toml settings/Testnet.toml
   ```

2. Update with your deployer keys

3. Deploy:
   ```bash
   clarinet deploy --network testnet
   ```

### Mainnet

Same process with `Mainnet.toml`. Ensure deployer has sufficient STX for fees.

## Current Testnet Deployment

Deployed to: `ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18`

| Contract | Explorer |
|----------|----------|
| identity-registry | [View](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry?chain=testnet) |
| reputation-registry | [View](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry?chain=testnet) |
| validation-registry | [View](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry?chain=testnet) |

---
*Updated: 2026-01-07*
