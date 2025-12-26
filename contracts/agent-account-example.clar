;; title: agent-account-example
;; version:
;; summary:
;; description:

;; traits
;;

;; token definitions
;;

;; constants
(define-constant DEPLOYED_BURN_BLOCK burn-block-height)
(define-constant DEPLOYED_STACKS_BLOCK stacks-block-height)
(define-constant SELF (as-contract tx-sender))

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
(define-constant APPROVED_CONTRACT_VOTING u1)
(define-constant APPROVED_CONTRACT_SWAP u2)
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
    (as-contract (stx-transfer? amount SELF ACCOUNT_OWNER))
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
    (as-contract (contract-call? ft transfer amount SELF ACCOUNT_OWNER none))
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

;; read only functions
;;

;; private functions
;;

