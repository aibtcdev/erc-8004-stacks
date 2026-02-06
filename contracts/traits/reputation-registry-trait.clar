;; title: reputation-registry-trait
;; version: 2.0.0
;; summary: Trait definition for ERC-8004 Reputation Registry
;; description: Defines the interface for reputation registry contracts. Includes all public state-changing functions. Read-only functions are not included as they return raw types (tuples, uints, optionals).

(define-trait reputation-registry-trait
  (
    ;; Client approval
    (approve-client (uint principal uint) (response bool uint))

    ;; Feedback submission (permissionless)
    (give-feedback (uint int uint (string-utf8 64) (string-utf8 64) (string-utf8 512) (string-utf8 512) (buff 32)) (response uint uint))

    ;; Feedback submission (pre-approved client)
    (give-feedback-approved (uint int uint (string-utf8 64) (string-utf8 64) (string-utf8 512) (string-utf8 512) (buff 32)) (response uint uint))

    ;; Feedback submission (signed authorization)
    (give-feedback-signed (uint principal int uint (string-utf8 64) (string-utf8 64) (string-utf8 512) (string-utf8 512) (buff 32) uint (buff 65)) (response uint uint))

    ;; Feedback management
    (revoke-feedback (uint uint) (response bool uint))

    ;; Response management
    (append-response (uint principal uint principal uint) (response bool uint))
  )
)
