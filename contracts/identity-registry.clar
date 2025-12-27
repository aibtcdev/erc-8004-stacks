;; title: identity-registry
;; version: 1.0.0
;; summary: ERC-8004 Identity Registry - Registers agent identities with sequential IDs, URIs, and metadata.
;; description: Compliant with ERC-8004 spec. Owner or approved operators can update URI/metadata. Single deployment per chain.

;; traits
;;

;; token definitions
;;

;; constants
(define-constant ERR_NOT_AUTHORIZED (err u1000))
(define-constant ERR_AGENT_NOT_FOUND (err u1001))
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
(define-map owners {agent-id: uint} principal)
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
    ;; TODO: map-set or map-insert w/ asserts?
    (map-set owners {agent-id: agent-id} owner)
    (map-set uris {agent-id: agent-id} token-uri)
    
    ;; Set metadata entries
    (fold 
      ((entry prior)
        (let (
          (mkey (get key entry))
          (mval (get value entry))
        )
          (map-set metadata {agent-id: agent-id, key: mkey} mval)
          prior
        )
      )
      metadata-entries
      true
    )
    
    (print {
      notification: "identity-registry/Registered",
      agent-id: agent-id,
      owner: owner,
      token-uri: token-uri,
      metadata-count: (len metadata-entries)
    })
    (ok agent-id)
  )
)

(define-public (set-agent-uri (agent-id uint) (new-uri (string-utf8 512)))
  (asserts! (is-authorized agent-id contract-caller) ERR_NOT_AUTHORIZED)
  (map-set uris {agent-id: agent-id} new-uri)
  (print {
    notification: "identity-registry/UriUpdated",
    agent-id: agent-id,
    new-uri: new-uri,
    updated-by: contract-caller
  })
  (ok true)
)

(define-public (set-metadata (agent-id uint) (key (string-utf8 128)) (value (buff 512)))
  (asserts! (is-authorized agent-id contract-caller) ERR_NOT_AUTHORIZED)
  (map-set metadata {agent-id: agent-id, key: key} value)
  (print {
    notification: "identity-registry/MetadataSet",
    agent-id: agent-id,
    key: key,
    value-len: (len value)
  })
  (ok true)
)

(define-public (set-approval-for-all (agent-id uint) (operator principal) (approved bool))
  (let (
    (owner (unwrap! (map-get? owners {agent-id: agent-id}) ERR_AGENT_NOT_FOUND))
  )
    (asserts! (is-eq tx-sender owner) ERR_NOT_AUTHORIZED)
    (map-set approvals {agent-id: agent-id, operator: operator} approved)
    (print {
      notification: "identity-registry/ApprovalForAll",
      agent-id: agent-id,
      operator: operator,
      approved: approved
    })
    (ok true)
  )
)
;;

;; read only functions

(define-read-only (owner-of (agent-id uint))
  (map-get? owners {agent-id: agent-id})
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
;;

;; private functions

(define-private (is-authorized (agent-id uint) (caller principal))
  (let (
    (owner-opt (map-get? owners {agent-id: agent-id}))
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
