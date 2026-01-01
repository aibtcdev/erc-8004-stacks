# ERC-8004: Agent Commerce Protocol on Stacks

**A cross-chain standard for AI agent identity, reputation, and validation—secured by Bitcoin.**

## What is ERC-8004?

ERC-8004 defines how autonomous AI agents establish verifiable identity, build reputation, and undergo validation across blockchain networks. Originally proposed for Ethereum, this implementation brings the standard to Stacks—enabling Bitcoin-secured agent commerce.

## Why It Matters

AI agents are becoming economic actors: negotiating services, executing payments, and interacting autonomously. They need:

- **Identity**: Unique, verifiable on-chain registration (like ENS for agents)
- **Reputation**: Feedback from clients to build trust over time
- **Validation**: Third-party verification of capabilities and compliance

Without standards, every platform reinvents these primitives. ERC-8004 creates interoperability.

## Why Stacks?

| Benefit | Description |
|---------|-------------|
| **Bitcoin Security** | Stacks settles to Bitcoin L1—agent identities inherit Bitcoin's finality |
| **Cross-Chain Compatible** | Same standard works on Ethereum, Solana, and now Stacks |
| **First Mover** | Be early to define how AI agents operate on Bitcoin |
| **Real Usage** | [AIBTC](https://github.com/aibtcdev) is integrating ERC-8004 into production |

## The Three Registries

### 1. Identity Registry
Register agents with unique IDs, URIs pointing to metadata, and custom key-value storage.

```clarity
;; Register an agent
(contract-call? .identity-registry register)

;; Set agent metadata URI
(contract-call? .identity-registry set-agent-uri u0 u"https://example.com/agent.json")
```

### 2. Reputation Registry
Clients submit feedback (1-5 score + tags). Agents can respond. Supports both on-chain and SIP-018 signature authentication.

```clarity
;; Submit feedback for agent #0
(contract-call? .reputation-registry submit-feedback
  u0                    ;; agent-id
  u5                    ;; score (1-5)
  (list u"reliable" u"fast")  ;; tags
  u"Great service!"     ;; comment
)
```

### 3. Validation Registry
Validators can approve/reject agents. Useful for compliance, capability verification, or curated directories.

```clarity
;; Request validation
(contract-call? .validation-registry request-validation u0)

;; Validator responds
(contract-call? .validation-registry submit-response u0 true u"Approved")
```

## Multichain Identity

Agents get globally unique IDs following [CAIP-2](https://github.com/ChainAgnostic/CAIPs/blob/master/CAIPs/caip-2.md):

```
stacks:2147483648:identity-registry:0
       └─ chain-id  └─ registry       └─ agent-id
```

Same agent can exist on multiple chains with linked identities.

## Testnet Contracts

Live on Stacks testnet—try them now:

| Contract | Address |
|----------|---------|
| Identity Registry | [`ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry`](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.identity-registry?chain=testnet) |
| Reputation Registry | [`ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry`](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.reputation-registry?chain=testnet) |
| Validation Registry | [`ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry`](https://explorer.hiro.so/txid/ST3YT0XW92E6T2FE59B2G5N2WNNFSBZ6MZKQS5D18.validation-registry?chain=testnet) |

## Get Involved

We're drafting a **Stacks Improvement Proposal (SIP)** to make this an official Stacks standard.

**How to help:**
1. **Test it**: Deploy agents on testnet, submit feedback, try validation flows
2. **Review the code**: [GitHub repo](https://github.com/aibtcdev/erc8004-registry-stacks)
3. **Give feedback**: Open issues or discussions on GitHub
4. **Build on it**: Create tools, dashboards, or integrations

## Links

- [ERC-8004 Ethereum Spec](https://eips.ethereum.org/EIPS/eip-8004)
- [Solidity Reference Implementation](https://github.com/erc8004-org/erc8004-contracts)
- [Solana Implementation (s8004)](https://github.com/Woody4618/s8004)
- [AIBTC Project](https://github.com/aibtcdev)

---

*Built by [@aibtcdev](https://x.com/aibtcdev) | Questions? Open an issue or reach out on X*
