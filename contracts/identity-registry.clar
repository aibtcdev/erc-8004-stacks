;; title: identity-registry
;; version: 2.0.0
;; summary: ERC-8004 Identity Registry - Registers agent identities with sequential IDs, URIs, and metadata.
;; description: Compliant with ERC-8004 spec. Owner or approved operators can update URI/metadata. Single deployment per chain.
;; auth: All authorization checks use tx-sender. Contract principals acting as owners/operators must use as-contract.
;;
;; ERC-8004 Spec Compliance
;; ========================
;;
;; Spec Function/Feature              | Implementation                    | Notes
;; ------------------------------------|-----------------------------------|------
;; ERC-721 NFT standard                | SIP-009 NFT (define-non-fungible-token) | Stacks equivalent
;; register()                          | register                          | Exact match
;; register(agentURI)                  | register-with-uri                 | Exact match
;; register(agentURI, metadata[])      | register-full                     | Exact match
;; setAgentURI(agentId, newURI)        | set-agent-uri                     | Exact match
;; getMetadata(agentId, key)           | get-metadata                      | Returns optional (Clarity convention)
;; setMetadata(agentId, key, value)    | set-metadata                      | Exact match
;; agentWallet reserved key            | ERR_RESERVED_KEY in set-metadata + register-full | Exact match
;; agentWallet auto-set on register    | map-set agent-wallets in register | Exact match
;; setAgentWallet (EIP-712 signature)  | set-agent-wallet-signed (SIP-018) | Stacks equivalent of EIP-712
;; (no EVM equivalent)                 | set-agent-wallet-direct           | Stacks enhancement: tx-sender path
;; getAgentWallet(agentId)             | get-agent-wallet                  | Returns optional (Clarity convention)
;; unsetAgentWallet(agentId)           | unset-agent-wallet                | Exact match
;; Transfer clears agentWallet         | map-delete in transfer            | Exact match
;; isAuthorizedOrOwner                 | is-authorized-or-owner            | Exact match (reverts if no agent)
;; Registered event                    | SIP-019 print                     | Stacks equivalent of EVM event
;; MetadataSet event                   | SIP-019 print (per-entry in fold) | Stacks equivalent of EVM event
;; URIUpdated event                    | SIP-019 print                     | Stacks equivalent of EVM event
;; Transfer event                      | SIP-019 print + native NFT event  | Stacks equivalent of EVM event
;; ERC-721 getTokenURI                 | get-token-uri (SIP-009)           | string-utf8 512 (wider than ERC-721)
;; ERC-721 ownerOf                     | get-owner / owner-of              | Exact match
;; ERC-721 transferFrom                | transfer                          | SIP-009 pattern (sender must be tx-sender)
;; approve / setApprovalForAll         | set-approval-for-all              | Per-agent operator approval
;; getApproved / isApprovedForAll      | is-approved-for-all               | Exact match

;; traits
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)

(impl-trait .identity-registry-trait.identity-registry-trait)
;;

;; token definitions
(define-non-fungible-token agent-identity uint)
;;

;; constants
(define-constant ERR_NOT_AUTHORIZED (err u1000))
(define-constant ERR_AGENT_NOT_FOUND (err u1001))
(define-constant ERR_AGENT_ALREADY_EXISTS (err u1002))
(define-constant ERR_METADATA_SET_FAILED (err u1003))
(define-constant ERR_RESERVED_KEY (err u1004))
(define-constant ERR_INVALID_SENDER (err u1005))
(define-constant ERR_WALLET_ALREADY_SET (err u1006))
(define-constant ERR_EXPIRED_SIGNATURE (err u1007))
(define-constant ERR_INVALID_SIGNATURE (err u1008))
(define-constant MAX_URI_LEN u512)
(define-constant MAX_KEY_LEN u128)
(define-constant MAX_VALUE_LEN u512)
(define-constant MAX_METADATA_ENTRIES u10)
(define-constant MAX_DEADLINE_DELAY u1500) ;; ~5 min at 200s blocks
(define-constant RESERVED_KEY_AGENT_WALLET u"agentWallet")
(define-constant SIP018_PREFIX 0x534950303138)
(define-constant DOMAIN_NAME "identity-registry")
(define-constant DOMAIN_VERSION "2.0.0")
(define-constant VERSION u"2.0.0")
;;

;; data vars
(define-data-var next-agent-id uint u0)
;;

;; data maps
(define-map uris {agent-id: uint} (string-utf8 512))
(define-map metadata {agent-id: uint, key: (string-utf8 128)} (buff 512))
(define-map approvals {agent-id: uint, operator: principal} bool)
(define-map agent-wallets {agent-id: uint} principal)
;;

;; public functions

(define-public (register)
  (register-with-uri u"")
)

(define-public (register-with-uri (token-uri (string-utf8 512)))
  (register-full token-uri (list))
)

(define-public (register-full
  (token-uri (string-utf8 512))
  (metadata-entries (list 10 {key: (string-utf8 128), value: (buff 512)}))
)
  (let (
    (agent-id (var-get next-agent-id))
    (owner tx-sender)
    (updated-next (+ agent-id u1))
  )
    ;; Atomic update
    (var-set next-agent-id updated-next)
    (try! (nft-mint? agent-identity agent-id owner))
    (asserts! (map-insert uris {agent-id: agent-id} token-uri) ERR_AGENT_ALREADY_EXISTS)
    ;; Auto-set agent-wallet to owner
    (map-set agent-wallets {agent-id: agent-id} owner)
    (let (
      (fold-result (fold metadata-fold-entry metadata-entries
        {agent-id: agent-id, success: true, reserved-key-found: false}
      ))
    )
      (asserts! (not (get reserved-key-found fold-result)) ERR_RESERVED_KEY)
      (asserts! (get success fold-result) ERR_METADATA_SET_FAILED)
      true
    )
    (print {
      notification: "identity-registry/Registered",
      payload: {
        agent-id: agent-id,
        owner: owner,
        token-uri: token-uri,
        metadata-count: (len metadata-entries)
      }
    })
    (print {
      notification: "identity-registry/MetadataSet",
      payload: {
        agent-id: agent-id,
        key: RESERVED_KEY_AGENT_WALLET,
        value-len: u20
      }
    })
    (ok agent-id)
  )
)

(define-public (set-agent-uri (agent-id uint) (new-uri (string-utf8 512)))
  (begin 
    (asserts! (is-authorized agent-id tx-sender) ERR_NOT_AUTHORIZED)
    (map-set uris {agent-id: agent-id} new-uri)
    (print {
      notification: "identity-registry/UriUpdated",
      payload: {
        agent-id: agent-id,
        new-uri: new-uri,
        updated-by: tx-sender
      }
    })
    (ok true)
  )
)

(define-public (set-metadata (agent-id uint) (key (string-utf8 128)) (value (buff 512)))
  (begin
    (asserts! (is-authorized agent-id tx-sender) ERR_NOT_AUTHORIZED)
    (asserts! (not (is-eq key RESERVED_KEY_AGENT_WALLET)) ERR_RESERVED_KEY)
    (map-set metadata {agent-id: agent-id, key: key} value)
    (print {
      notification: "identity-registry/MetadataSet",
      payload: {
        agent-id: agent-id,
        key: key,
        value-len: (len value)
      }
    })
    (ok true)
  )
)

(define-public (set-approval-for-all (agent-id uint) (operator principal) (approved bool))
  (let (
    (owner (unwrap! (nft-get-owner? agent-identity agent-id) ERR_AGENT_NOT_FOUND))
  )
    (asserts! (is-eq tx-sender owner) ERR_NOT_AUTHORIZED)
    (map-set approvals {agent-id: agent-id, operator: operator} approved)
    (print {
      notification: "identity-registry/ApprovalForAll",
      payload: {
        agent-id: agent-id,
        operator: operator,
        approved: approved
      }
    })
    (ok true)
  )
)

(define-public (set-agent-wallet-direct (agent-id uint))
  (let (
    (current-wallet-opt (map-get? agent-wallets {agent-id: agent-id}))
  )
    ;; Verify agent exists
    (unwrap! (nft-get-owner? agent-identity agent-id) ERR_AGENT_NOT_FOUND)
    ;; Check caller is authorized (owner or approved operator)
    (asserts! (is-authorized agent-id tx-sender) ERR_NOT_AUTHORIZED)
    ;; Check caller is not already the wallet
    (match current-wallet-opt current-wallet
      (asserts! (not (is-eq tx-sender current-wallet)) ERR_WALLET_ALREADY_SET)
      true
    )
    ;; Set new wallet
    (map-set agent-wallets {agent-id: agent-id} tx-sender)
    (print {
      notification: "identity-registry/MetadataSet",
      payload: {
        agent-id: agent-id,
        key: RESERVED_KEY_AGENT_WALLET,
        value-len: u20
      }
    })
    (ok true)
  )
)

(define-public (set-agent-wallet-signed
  (agent-id uint)
  (new-wallet principal)
  (deadline uint)
  (signature (buff 65))
)
  (let (
    (owner (unwrap! (nft-get-owner? agent-identity agent-id) ERR_AGENT_NOT_FOUND))
    (current-height stacks-block-height)
  )
    ;; Authorization check
    (asserts! (is-authorized agent-id tx-sender) ERR_NOT_AUTHORIZED)
    ;; Deadline checks
    (asserts! (<= current-height deadline) ERR_EXPIRED_SIGNATURE)
    (asserts! (<= deadline (+ current-height MAX_DEADLINE_DELAY)) ERR_EXPIRED_SIGNATURE)
    ;; Build SIP-018 structured data
    (let (
      (domain {
        name: DOMAIN_NAME,
        version: DOMAIN_VERSION,
        chain-id: chain-id
      })
      (message {
        agent-id: agent-id,
        new-wallet: new-wallet,
        owner: owner,
        deadline: deadline
      })
      (msg-hash (hash-sip018-message domain message))
      (recovered-key (unwrap! (secp256k1-recover? msg-hash signature) ERR_INVALID_SIGNATURE))
      (recovered-principal (unwrap! (principal-of? recovered-key) ERR_INVALID_SIGNATURE))
    )
      ;; Verify signature is from new-wallet
      (asserts! (is-eq recovered-principal new-wallet) ERR_INVALID_SIGNATURE)
      ;; Set new wallet
      (map-set agent-wallets {agent-id: agent-id} new-wallet)
      (print {
        notification: "identity-registry/MetadataSet",
        payload: {
          agent-id: agent-id,
          key: RESERVED_KEY_AGENT_WALLET,
          value-len: u20
        }
      })
      (ok true)
    )
  )
)

(define-public (unset-agent-wallet (agent-id uint))
  (let (
    (owner (unwrap! (nft-get-owner? agent-identity agent-id) ERR_AGENT_NOT_FOUND))
  )
    (asserts! (is-authorized agent-id tx-sender) ERR_NOT_AUTHORIZED)
    (map-delete agent-wallets {agent-id: agent-id})
    (print {
      notification: "identity-registry/MetadataSet",
      payload: {
        agent-id: agent-id,
        key: RESERVED_KEY_AGENT_WALLET,
        value-len: u0
      }
    })
    (ok true)
  )
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR_INVALID_SENDER)
    (let ((actual-owner (unwrap! (nft-get-owner? agent-identity token-id) ERR_AGENT_NOT_FOUND)))
      (asserts! (is-eq sender actual-owner) ERR_NOT_AUTHORIZED)
      ;; Clear agent wallet before transfer
      (map-delete agent-wallets {agent-id: token-id})
      (print {
        notification: "identity-registry/MetadataSet",
        payload: {
          agent-id: token-id,
          key: RESERVED_KEY_AGENT_WALLET,
          value-len: u0
        }
      })
      (try! (nft-transfer? agent-identity token-id sender recipient))
      (print {
        notification: "identity-registry/Transfer",
        payload: {
          token-id: token-id,
          sender: sender,
          recipient: recipient
        }
      })
      (ok true)
    )
  )
)
;;

;; read only functions

;; Legacy alias for backward compatibility
(define-read-only (owner-of (agent-id uint))
  (nft-get-owner? agent-identity agent-id)
)

(define-read-only (get-uri (agent-id uint))
  (map-get? uris {agent-id: agent-id})
)

(define-read-only (get-metadata (agent-id uint) (key (string-utf8 128)))
  (map-get? metadata {agent-id: agent-id, key: key})
)

(define-read-only (is-approved-for-all (agent-id uint) (operator principal))
  (default-to false (map-get? approvals {agent-id: agent-id, operator: operator}))
)

(define-read-only (get-version)
  VERSION
)

(define-read-only (get-agent-wallet (agent-id uint))
  (map-get? agent-wallets {agent-id: agent-id})
)

(define-read-only (is-authorized-or-owner (spender principal) (agent-id uint))
  (let (
    (owner (unwrap! (nft-get-owner? agent-identity agent-id) ERR_AGENT_NOT_FOUND))
  )
    (ok (or
      (is-eq spender owner)
      (is-approved-for-all agent-id spender)
    ))
  )
)

;; SIP-009 trait functions

(define-read-only (get-last-token-id)
  (let ((current-id (var-get next-agent-id)))
    (if (is-eq current-id u0)
      ERR_AGENT_NOT_FOUND
      (ok (- current-id u1))
    )
  )
)

(define-read-only (get-token-uri (token-id uint))
  (ok (map-get? uris {agent-id: token-id}))
)

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? agent-identity token-id))
)
;;

;; private functions

(define-private (metadata-fold-entry
  (entry {key: (string-utf8 128), value: (buff 512)})
  (prior-acc {agent-id: uint, success: bool, reserved-key-found: bool})
)
  (if (not (get success prior-acc))
    prior-acc
    (let (
      (aid (get agent-id prior-acc))
    )
      (if (is-eq (get key entry) RESERVED_KEY_AGENT_WALLET)
        {agent-id: aid, success: false, reserved-key-found: true}
        (let (
          (k (get key entry))
          (v (get value entry))
        )
          (map-set metadata {agent-id: aid, key: k} v)
          (print {
            notification: "identity-registry/MetadataSet",
            payload: {
              agent-id: aid,
              key: k,
              value-len: (len v)
            }
          })
          {agent-id: aid, success: true, reserved-key-found: false}
        )
      )
    )
  )
)

(define-private (is-authorized (agent-id uint) (caller principal))
  (let (
    (owner-opt (nft-get-owner? agent-identity agent-id))
  )
    (match owner-opt owner
      (or
        (is-eq caller owner)
        (is-approved-for-all agent-id caller)
      )
      false
    )
  )
)

(define-private (hash-sip018-message
  (domain {name: (string-ascii 64), version: (string-ascii 64), chain-id: uint})
  (message {agent-id: uint, new-wallet: principal, owner: principal, deadline: uint})
)
  (let (
    (domain-hash (sha256 (unwrap-panic (to-consensus-buff? domain))))
    (structured-data-hash (sha256 (unwrap-panic (to-consensus-buff? message))))
  )
    (sha256 (concat SIP018_PREFIX (concat domain-hash structured-data-hash)))
  )
)
