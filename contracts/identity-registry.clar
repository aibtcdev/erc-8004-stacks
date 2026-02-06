;; title: identity-registry
;; version: 1.0.0
;; summary: ERC-8004 Identity Registry - Registers agent identities with sequential IDs, URIs, and metadata.
;; description: Compliant with ERC-8004 spec. Owner or approved operators can update URI/metadata. Single deployment per chain.

;; traits
(define-trait nft-trait
  (
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-ascii 256)) uint))
    (get-owner (uint) (response (optional principal) uint))
    (transfer (uint principal principal) (response bool uint))
  )
)
;;

;; token definitions
(define-non-fungible-token agent-identity uint)
;;

;; constants
(define-constant ERR_NOT_AUTHORIZED (err u1000))
(define-constant ERR_AGENT_NOT_FOUND (err u1001))
(define-constant ERR_AGENT_ALREADY_EXISTS (err u1002))
(define-constant ERR_METADATA_SET_FAILED (err u1003))
(define-constant ERR_INVALID_SENDER (err u1005))
(define-constant MAX_URI_LEN u512)
(define-constant MAX_KEY_LEN u128)
(define-constant MAX_VALUE_LEN u512)
(define-constant MAX_METADATA_ENTRIES u10)
(define-constant VERSION u"1.0.0")
;;

;; data vars
(define-data-var next-agent-id uint u0)
;;

;; data maps
(define-map uris {agent-id: uint} (string-utf8 512))
(define-map metadata {agent-id: uint, key: (string-utf8 128)} (buff 512))
(define-map approvals {agent-id: uint, operator: principal} bool)
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
    (asserts! (get success
      (fold metadata-fold-entry metadata-entries
        {agent-id: agent-id, success: true}
      )
    ) ERR_METADATA_SET_FAILED)
    (print {
      notification: "identity-registry/Registered",
      payload: {
        agent-id: agent-id,
        owner: owner,
        token-uri: token-uri,
        metadata-count: (len metadata-entries)
      }
    })
    (ok agent-id)
  )
)

(define-public (set-agent-uri (agent-id uint) (new-uri (string-utf8 512)))
  (begin 
    (asserts! (is-authorized agent-id contract-caller) ERR_NOT_AUTHORIZED)
    (map-set uris {agent-id: agent-id} new-uri)
    (print {
      notification: "identity-registry/UriUpdated",
      payload: {
        agent-id: agent-id,
        new-uri: new-uri,
        updated-by: contract-caller
      }
    })
    (ok true)
  )
)

(define-public (set-metadata (agent-id uint) (key (string-utf8 128)) (value (buff 512)))
  (begin (asserts! (is-authorized agent-id contract-caller) ERR_NOT_AUTHORIZED)
  (map-set metadata {agent-id: agent-id, key: key} value)
  (print {
    notification: "identity-registry/MetadataSet",
    payload: {
      agent-id: agent-id,
      key: key,
      value-len: (len value)
    }
  })
  (ok true))
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

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender sender) ERR_INVALID_SENDER)
    (let ((actual-owner (unwrap! (nft-get-owner? agent-identity token-id) ERR_AGENT_NOT_FOUND)))
      (asserts! (is-eq sender actual-owner) ERR_NOT_AUTHORIZED)
      ;; Phase 1: clear agent-wallet metadata here before transfer
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
  (prior-acc {agent-id: uint, success: bool})
)
  (if (not (get success prior-acc))
    prior-acc
    (let (
      (aid (get agent-id prior-acc))
    )
      (map-set metadata {agent-id: aid, key: (get key entry)} (get value entry))
      {agent-id: aid, success: true}
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
