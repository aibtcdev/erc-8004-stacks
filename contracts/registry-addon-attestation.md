# Registry Addon - Attestation

Stub contract for modular attestations/validations, extending owner-agent-registry (analogous to ERC-8004 Validation/Reputation Registries).

## Summary

Placeholder for third-party attestations (e.g., validator responses), feedback scores, or reputation tracking. References core registry agentIds for composability.

Future: `giveFeedback(agentId, score, tags...)`, `getSummary(agentId...)`.

## Key Functions

(None implemented.)

## Read-only Functions

(None implemented.)

## Important Considerations

- Deploy alongside core registry.
- Query core `get-agent-id` for attestations.
- Design for: Validator requests/responses, client feedback (with revocation), tag-based summaries.
- Integrates with agent accounts for proof-of-completion (e.g., x402 payments).
- Extend stub with maps/events matching ERC-8004 patterns.
