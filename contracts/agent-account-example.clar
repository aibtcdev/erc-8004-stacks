;; title: agent-account-example
;; version: 4.0.0
;; summary: On-chain codified relationship between an owner and an agent.

;; traits
;;
(use-trait ft-trait 'SP3FBR2AGK5H9QBDH3EEN6DF8EK8JY7RX8QJ5SVTE.sip-010-trait-ft-standard.sip-010-trait)

;; token definitions
;;

;; constants
(define-constant DEPLOYED_BURN_BLOCK burn-block-height)
(define-constant DEPLOYED_STACKS_BLOCK stacks-block-height)
(define-constant DEPLOYED_STACKS_TIME stacks-block-time)
(define-constant SELF current-contract)

;; owner and agent addresses
(define-constant ACCOUNT_OWNER 'ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM) ;; owner (user/creator of account, full access)
(define-constant ACCOUNT_AGENT 'ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG) ;; agent (can only take approved actions)
(define-constant SBTC_TOKEN 'STV9K21TBFAK4KNRJXF5DFP8N7W46G4V9RJ5XDY2.sbtc-token) ;; sBTC token

;; error codes
(define-constant ERR_CALLER_NOT_OWNER (err u1100))
(define-constant ERR_CONTRACT_NOT_APPROVED (err u1101))
(define-constant ERR_OPERATION_NOT_ALLOWED (err u1102))
(define-constant ERR_INVALID_APPROVAL_TYPE (err u1103))

;; permission flags
(define-constant PERMISSION_MANAGE_ASSETS (pow u2 u0))
(define-constant PERMISSION_APPROVE_REVOKE_CONTRACTS (pow u2 u1))
(define-constant PERMISSION_BUY_SELL_ASSETS (pow u2 u2))

;; contract approval types
;; TODO: how to better do this
(define-constant APPROVED_CONTRACT_TOKEN u3)

;; data maps
(define-map ApprovedContracts
  {
    contract: principal,
    type: uint, ;; matches defined constants
  }
  bool
)

;; insert sBTC token into approved contracts
(map-set ApprovedContracts {
  contract: SBTC_TOKEN,
  type: APPROVED_CONTRACT_TOKEN,
}
  true
)

;; data vars
(define-constant DEFAULT_PERMISSIONS (+
  PERMISSION_MANAGE_ASSETS
  PERMISSION_APPROVE_REVOKE_CONTRACTS
))
(define-data-var agentPermissions uint DEFAULT_PERMISSIONS)

;; public functions

;; the owner or agent can deposit STX to this contract
(define-public (deposit-stx (amount uint))
  (begin
    (asserts! (manage-assets-allowed) ERR_OPERATION_NOT_ALLOWED)
    (print {
      notification: "aibtc-agent-account/deposit-stx",
      payload: {
        contractCaller: contract-caller,
        txSender: tx-sender,
        amount: amount,
        recipient: SELF,
      },
    })
    (stx-transfer? amount contract-caller SELF)
  )
)

;; the owner or agent can deposit FT to this contract
(define-public (deposit-ft
    (ft <ft-trait>)
    (amount uint)
  )
  (begin
    (asserts! (manage-assets-allowed) ERR_OPERATION_NOT_ALLOWED)
    (print {
      notification: "aibtc-agent-account/deposit-ft",
      payload: {
        amount: amount,
        assetContract: (contract-of ft),
        txSender: tx-sender,
        contractCaller: contract-caller,
        recipient: SELF,
      },
    })
    (contract-call? ft transfer amount contract-caller SELF none)
  )
)

;; only the owner or authorized agent can withdraw STX from this contract
;; funds are always sent to the hardcoded ACCOUNT_OWNER
(define-public (withdraw-stx (amount uint))
  (begin
    (asserts! (manage-assets-allowed) ERR_OPERATION_NOT_ALLOWED)
    (print {
      notification: "aibtc-agent-account/withdraw-stx",
      payload: {
        amount: amount,
        sender: SELF,
        caller: contract-caller,
        recipient: ACCOUNT_OWNER,
      },
    })
    (as-contract? () (stx-transfer? amount SELF ACCOUNT_OWNER))
  )
)

;; only the owner or authorized agent can withdraw FT from this contract if the asset contract is approved
;; funds are always sent to the hardcoded ACCOUNT_OWNER
(define-public (withdraw-ft
    (ft <ft-trait>)
    (amount uint)
  )
  (begin
    (asserts! (manage-assets-allowed) ERR_OPERATION_NOT_ALLOWED)
    (asserts! (is-approved-contract (contract-of ft) APPROVED_CONTRACT_TOKEN)
      ERR_CONTRACT_NOT_APPROVED
    )
    (print {
      notification: "aibtc-agent-account/withdraw-ft",
      payload: {
        amount: amount,
        assetContract: (contract-of ft),
        sender: SELF,
        caller: contract-caller,
        recipient: ACCOUNT_OWNER,
      },
    })
    (as-contract? () (contract-call? ft transfer amount SELF ACCOUNT_OWNER none))
  )
)


;; the owner or the agent (if enabled) can approve a contract for use with the agent account
(define-public (approve-contract
    (contract principal)
    (type uint)
  )
  (begin
    (asserts! (is-valid-type type) ERR_INVALID_APPROVAL_TYPE)
    (asserts! (approve-revoke-contract-allowed) ERR_OPERATION_NOT_ALLOWED)
    (print {
      notification: "aibtc-agent-account/approve-contract",
      payload: {
        contract: contract,
        type: type,
        approved: true,
        sender: tx-sender,
        caller: contract-caller,
      },
    })
    (ok (map-set ApprovedContracts {
      contract: contract,
      type: type,
    }
      true
    ))
  )
)

;; the owner or the agent (if enabled) can revoke a contract from use with the agent account
(define-public (revoke-contract
    (contract principal)
    (type uint)
  )
  (begin
    (asserts! (is-valid-type type) ERR_INVALID_APPROVAL_TYPE)
    (asserts! (approve-revoke-contract-allowed) ERR_OPERATION_NOT_ALLOWED)
    (print {
      notification: "aibtc-agent-account/revoke-contract",
      payload: {
        contract: contract,
        type: type,
        approved: false,
        sender: tx-sender,
        caller: contract-caller,
      },
    })
    (ok (map-set ApprovedContracts {
      contract: contract,
      type: type,
    }
      false
    ))
  )
)

;; owner can set agent permissions
(define-public (set-agent-permissions (permissions uint))
  (begin
    (asserts! (is-owner) ERR_CALLER_NOT_OWNER)
    (var-set agentPermissions permissions)
    (print {
      notification: "aibtc-agent-account/set-agent-permissions",
      payload: {
        new-permissions: permissions,
        setter: contract-caller
      }
    })
    (ok permissions)))


;; read only functions

(define-read-only (is-approved-contract
    (contract principal)
    (type uint)
  )
  (default-to false
    (map-get? ApprovedContracts {
      contract: contract,
      type: type,
    })
  )
)

(define-read-only (get-configuration)
  {
    account: SELF,
    agent: ACCOUNT_AGENT,
    owner: ACCOUNT_OWNER,
    sbtc: SBTC_TOKEN,
  }
)

(define-read-only (get-approval-types)
  {
    token: APPROVED_CONTRACT_TOKEN,
  }
)

(define-read-only (get-agent-permissions)
  (let ((permissions (var-get agentPermissions)))
    {
      canManageAssets: (not (is-eq u0 (bit-and permissions PERMISSION_MANAGE_ASSETS))),
      canApproveRevokeContracts: (not (is-eq u0 (bit-and permissions PERMISSION_APPROVE_REVOKE_CONTRACTS))),
    }
  )
)

;; private functions
;;

(define-private (is-owner)
  (is-eq contract-caller ACCOUNT_OWNER)
)

(define-private (is-agent)
  (is-eq contract-caller ACCOUNT_AGENT)
)

(define-private (is-valid-type (type uint))
  (or
    (is-eq type APPROVED_CONTRACT_TOKEN)
  )
)

(define-private (manage-assets-allowed)
  (or (is-owner) (and (is-agent) (not (is-eq u0 (bit-and (var-get agentPermissions) PERMISSION_MANAGE_ASSETS)))))
)

(define-private (approve-revoke-contract-allowed)
  (or (is-owner) (and (is-agent) (not (is-eq u0 (bit-and (var-get agentPermissions) PERMISSION_APPROVE_REVOKE_CONTRACTS)))))
)

;; initialization
;;

(begin
  ;; print creation event
  (print {
    notification: "aibtc-agent-account/user-agent-account-created",
    payload: {
      config: (get-configuration),
      approvalTypes: (get-approval-types),
      agentPermissions: (get-agent-permissions),
    },
  })
  ;; auto-register the agent account with base-registry (owner calls manually after deploy)
  ;; (contract-call? .base-registry register-agent ACCOUNT_AGENT (string-utf8 "Agent Account Example") (string-utf8 "Example agent account for secure asset management"))
)
