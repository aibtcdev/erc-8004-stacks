# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ERC-8004 Stacks Contracts - Clarity smart contracts implementing the ERC-8004 agent identity/reputation/validation protocol for Stacks blockchain. Mirrors the [Solidity reference implementation](https://github.com/erc8004-org/erc8004-contracts).

**Current Status**: All three registries ✅ complete with 59 tests passing.

## Commands

```bash
# Install dependencies
npm install

# Run all tests (Vitest + Clarinet SDK)
npm test

# Run tests with coverage and cost reports
npm run test:report

# Watch mode (auto-run tests on changes)
npm run test:watch

# Type-check Clarity contracts
clarinet check

# Interactive dev shell with REPL
clarinet integrate

# Clarity REPL console
clarinet console

# Deploy to testnet (after configuring settings/Testnet.toml)
clarinet deploy --network testnet
```

## Architecture

Three contracts implementing ERC-8004 spec as chain singletons:

| Contract | Purpose | Status |
|----------|---------|--------|
| `identity-registry.clar` | Agent registration (ERC-721 equivalent), URIs, metadata | ✅ Done |
| `reputation-registry.clar` | Client feedback (score/tags/revoke/response), SIP-018 + on-chain auth | ✅ Done |
| `validation-registry.clar` | Validator requests/responses | ✅ Done |

**Multichain ID Format**: `stacks:<chainId>:<registry>:<agentId>` (CAIP-2 compliant)
- Mainnet: `stacks:1`
- Testnet: `stacks:2147483648`

## Clarity Conventions

**Error constants** use ranges per contract:
- Identity Registry: u1000+
- Validation Registry: u2000+
- Reputation Registry: u3000+

```clarity
(define-constant ERR_NOT_AUTHORIZED (err u1000))
(define-constant ERR_AGENT_NOT_FOUND (err u1001))
```

**Events** follow SIP-019 pattern:
```clarity
(print {
  notification: "identity-registry/AgentRegistered",
  payload: { agent-id: agent-id, owner: tx-sender }
})
```

**Type constraints**:
- URI: `(string-utf8 512)`
- Metadata key: `(string-utf8 128)`
- Metadata value: `(buff 512)`
- Max metadata entries per registration: 10

## Testing

Tests use Vitest with `vitest-environment-clarinet`. Test file location: `tests/`.

**Test accounts** (from `settings/Devnet.toml`):
- `deployer`: `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM`
- `wallet_1` through `wallet_8`: Available for testing

**Calling contract functions in tests**:
```typescript
import { Cl, uintCV, stringUtf8CV, bufferCV, tupleCV, listCV } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const address1 = accounts.get("wallet_1")!;

// Public function
const { result } = simnet.callPublicFn("identity-registry", "register", [], address1);
expect(result).toBeOk(uintCV(0n));

// Read-only function
const { result } = simnet.callReadOnlyFn("identity-registry", "owner-of", [uintCV(0n)], address1);
expect(result).toBeSome(Cl.principal(address1));
```

**Clarinet SDK matchers**: `toBeOk()`, `toBeErr()`, `toBeSome()`, `toBeNone()`, `toBeBool()`, `toBeUint()`

## Reference Documentation

- Implementation plan: `docs/STACKS_ERC8004_IMPLEMENTATION.md`
- Clarity language reference: `docs/CLARITY_REFERENCE.md`
- Solidity reference: `docs/erc8004-contracts-*.md`
- ERC-8004 spec: `docs/erc8004-proposal-text.md`
