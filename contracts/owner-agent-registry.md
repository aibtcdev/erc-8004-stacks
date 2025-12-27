# Owner-Agent Registry

Minimal Stacks contract for one-to-one owner-agent identity mapping, analogous to ERC-8004 Identity Registry (without NFTs).

## Summary

Maps bare principal owners (humans) to contract principal agents. Generates unique SHA-256 ID from serialized tuple. Supports registration, updates, deregistration (owner-only). Enables discovery and ownership verification for agent ecosystems.

One agent per owner. Extensible via addons (e.g., attestations, reputation).

## Key Functions

**Registration:**
- `register-agent(principal agent, (string-utf8 256) name, (string-utf8 256) description) → uint256 agentId`

**Management:**
- `deregister-agent(principal agent) → bool`
- `update-agent-details(principal agent, (string-utf8 256) name, (string-utf8 256) description) → uint256 agentId`

## Read-only Functions

**Queries:**
- `get-agent-by-owner(principal owner) → (option principal)`
- `get-owner-by-agent(principal agent) → (option principal)`
- `get-agent-details(principal agent) → (option {owner: principal, name: (string-utf8 256), description: (string-utf8 256)})`
- `get-agent-info(principal agent) → (option {owner: principal, agent: principal, name: (string-utf8 256), description: (string-utf8 256), id: (buff 32)})`

**ID Computation:**
- `compute-agent-id-tuple(...) → (buff 32)`
- `compute-agent-id-serialized(...) → (buff 32)`

## Important Considerations

- Owner: bare principal (e.g., ST1...). Agent: contract principal (e.g., ST2...).
- Errors: u100 (already registered), u101 (not owner), u102/103 (invalid types), u104 (not found), u105/u1234 (hashing).
- ID: SHA-256 of consensus-serialized `{owner, agent, name, description}`.
- Integrates with agent accounts (e.g., agent-account-example) and future addons (reputation/attestations).
- Events printed on register/update/deregister for off-chain indexing.
