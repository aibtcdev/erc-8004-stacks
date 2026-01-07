---
title: Tests
layout: default
nav_order: 3
---

[← Home](./index.html) | **Tests**

# Tests

> Vitest test suite with Clarinet SDK for contract verification.

## Contents

| Test File | Coverage |
|-----------|----------|
| [`identity-registry.test.ts`](https://github.com/aibtc/erc8004-registry-stacks/blob/master/tests/identity-registry.test.ts) | 18 tests |
| [`reputation-registry.test.ts`](https://github.com/aibtc/erc8004-registry-stacks/blob/master/tests/reputation-registry.test.ts) | 23 tests |
| [`validation-registry.test.ts`](https://github.com/aibtc/erc8004-registry-stacks/blob/master/tests/validation-registry.test.ts) | 18 tests |
| [`erc8004-integration.test.ts`](https://github.com/aibtc/erc8004-registry-stacks/blob/master/tests/erc8004-integration.test.ts) | 14 tests |

**Total**: 73 tests passing

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage and cost reports
npm run test:report

# Watch mode
npm run test:watch
```

## Test Structure

Tests use the Clarinet SDK with Vitest. Each test:
1. Sets up test accounts from `settings/Devnet.toml`
2. Calls contract functions via `simnet.callPublicFn()` or `simnet.callReadOnlyFn()`
3. Asserts results using Clarinet matchers (`toBeOk()`, `toBeErr()`, etc.)

### Example

```typescript
import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;

describe("identity-registry", () => {
  it("registers a new agent", () => {
    const { result } = simnet.callPublicFn(
      "identity-registry",
      "register",
      [],
      wallet1
    );
    expect(result).toBeOk(Cl.uint(0));
  });
});
```

## Test Accounts

From `settings/Devnet.toml`:

| Account | Address |
|---------|---------|
| deployer | `ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM` |
| wallet_1 | Available for testing |
| wallet_2-8 | Additional test accounts |

---
*Updated: 2026-01-07*
