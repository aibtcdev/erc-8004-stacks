---
title: Contracts
layout: default
nav_order: 2
---

[← Home](./index.html) | **Contracts**

# Contracts

> Clarity smart contracts implementing the ERC-8004 agent identity, reputation, and validation protocol.

## Contents

| Contract | Purpose |
|----------|---------|
| [`identity-registry.clar`](https://github.com/aibtc/erc8004-registry-stacks/blob/master/contracts/identity-registry.clar) | Agent registration with sequential IDs, URIs, and metadata |
| [`reputation-registry.clar`](https://github.com/aibtc/erc8004-registry-stacks/blob/master/contracts/reputation-registry.clar) | Client feedback with scores, tags, and SIP-018 signatures |
| [`validation-registry.clar`](https://github.com/aibtc/erc8004-registry-stacks/blob/master/contracts/validation-registry.clar) | Third-party validation requests and responses |

---

## Identity Registry

Registers agents with unique IDs (ERC-721 equivalent). Each agent has an owner, optional URI, and key-value metadata.

### Key Functions

| Function | Description |
|----------|-------------|
| `register` | Register a new agent, returns agent-id |
| `register-with-uri` | Register with a metadata URI |
| `register-full` | Register with URI and metadata entries |
| `set-agent-uri` | Update agent's URI (owner/operator only) |
| `set-metadata` | Set key-value metadata (owner/operator only) |
| `set-approval` | Approve an operator for an agent |

### Read-Only

| Function | Returns |
|----------|---------|
| `owner-of` | Agent owner principal |
| `get-agent-uri` | Agent metadata URI |
| `get-metadata` | Metadata value for key |
| `is-approved` | Check if operator is approved |

### Error Codes

| Code | Constant |
|------|----------|
| u1000 | `ERR_NOT_AUTHORIZED` |
| u1001 | `ERR_AGENT_NOT_FOUND` |
| u1002 | `ERR_AGENT_ALREADY_EXISTS` |
| u1003 | `ERR_METADATA_SET_FAILED` |

---

## Reputation Registry

Allows clients to submit feedback on agents. Supports both on-chain approval and SIP-018 signed authorization.

### Key Functions

| Function | Description |
|----------|-------------|
| `approve-client` | Owner approves client to give feedback |
| `give-feedback` | Submit feedback with on-chain approval |
| `give-feedback-signed` | Submit feedback with SIP-018 signature |
| `revoke-feedback` | Client revokes their own feedback |
| `respond-to-feedback` | Agent owner responds to feedback |

### Read-Only

| Function | Returns |
|----------|---------|
| `get-feedback` | Feedback entry by agent/client/index |
| `get-latest-feedback` | Most recent feedback for agent/client |
| `get-clients` | List of clients who gave feedback |
| `get-responses` | Responses to a feedback entry |

### Error Codes

| Code | Constant |
|------|----------|
| u3000 | `ERR_NOT_AUTHORIZED` |
| u3001 | `ERR_AGENT_NOT_FOUND` |
| u3002 | `ERR_FEEDBACK_NOT_FOUND` |
| u3003 | `ERR_ALREADY_REVOKED` |
| u3004 | `ERR_INVALID_SCORE` |
| u3005 | `ERR_SELF_FEEDBACK` |
| u3006 | `ERR_INVALID_INDEX` |
| u3007 | `ERR_SIGNATURE_INVALID` |
| u3008 | `ERR_AUTH_EXPIRED` |
| u3009 | `ERR_INDEX_LIMIT_EXCEEDED` |
| u3010 | `ERR_EMPTY_URI` |

---

## Validation Registry

Enables third-party validators to validate agents. Agent owners request validation, validators respond with scores.

### Key Functions

| Function | Description |
|----------|-------------|
| `validation-request` | Request validation from a validator |
| `validation-response` | Validator responds with score |
| `update-response` | Validator updates their response |
| `revoke-validation` | Agent owner revokes a validation |

### Read-Only

| Function | Returns |
|----------|---------|
| `get-validation` | Validation record by request-hash |
| `get-agent-validations` | List of validations for an agent |
| `get-validator-requests` | List of requests for a validator |

### Error Codes

| Code | Constant |
|------|----------|
| u2000 | `ERR_NOT_AUTHORIZED` |
| u2001 | `ERR_AGENT_NOT_FOUND` |
| u2002 | `ERR_VALIDATION_NOT_FOUND` |
| u2003 | `ERR_VALIDATION_EXISTS` |
| u2004 | `ERR_INVALID_VALIDATOR` |
| u2005 | `ERR_INVALID_RESPONSE` |

---
*Updated: 2026-01-07*
