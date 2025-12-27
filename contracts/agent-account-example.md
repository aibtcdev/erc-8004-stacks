# Agent Account Example

Example agent contract demonstrating secure, permissioned asset management owned via owner-agent-registry.

## Summary

Codifies owner-agent relationship with granular permissions (manage assets, approve contracts). Supports STX/FT deposits/withdrawals (to owner), contract approvals/revokes. Hardcoded addresses for demo; agent acts with owner oversight.

References sBTC; extensible to other FTs via approvals.

## Key Functions

**Deposits:**
- `deposit-stx(uint amount) → bool`
- `deposit-ft(<ft-trait> ft, uint amount) → bool`

**Withdrawals (to owner):**
- `withdraw-stx(uint amount) → bool`
- `withdraw-ft(<ft-trait> ft, uint amount) → bool`

**Permissions/Approvals:**
- `approve-contract(principal contract, uint type) → bool`
- `revoke-contract(principal contract, uint type) → bool`
- `set-agent-permissions(uint permissions) → uint` (owner-only)

## Read-only Functions

**Queries:**
- `is-approved-contract(principal contract, uint type) → bool`
- `get-configuration() → {account: principal, agent: principal, owner: principal, sbtc: principal}`
- `get-approval-types() → {token: uint}`
- `get-agent-permissions() → {canManageAssets: bool, canApproveRevokeContracts: bool}`

## Important Considerations

- Permissions: Bitflags (u1: manage assets, u2: approve/revoke contracts). Defaults enable both for agent.
- Approvals: Required for FT withdrawals (e.g., sBTC pre-approved).
- Caller checks: Owner full access; agent limited by permissions.
- Withdrawals always to hardcoded owner (ACCOUNT_OWNER).
- Register with registry post-deploy: `register-agent ACCOUNT_AGENT "Agent Account Example" "Example agent account..."`.
- Errors: u1100 (not owner), u1101 (not approved), u1102 (not allowed), u1103 (invalid type).
