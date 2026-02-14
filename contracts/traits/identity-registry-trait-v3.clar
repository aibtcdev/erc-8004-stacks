;; title: identity-registry-trait
;; version: 3.0.0
;; summary: Trait definition for ERC-8004 Identity Registry
;; description: Defines the interface for identity registry contracts. Includes all public state-changing functions and response-wrapped read-only functions (SIP-009 + is-authorized-or-owner).

(define-trait identity-registry-trait
  (
    ;; Registration functions
    (register () (response uint uint))
    (register-with-uri ((string-utf8 512)) (response uint uint))
    (register-full ((string-utf8 512) (list 10 {key: (string-utf8 128), value: (buff 512)})) (response uint uint))

    ;; Metadata management
    (set-agent-uri (uint (string-utf8 512)) (response bool uint))
    (set-metadata (uint (string-utf8 128) (buff 512)) (response bool uint))

    ;; Approval management
    (set-approval-for-all (uint principal bool) (response bool uint))

    ;; Agent wallet management
    (set-agent-wallet-direct (uint) (response bool uint))
    (set-agent-wallet-signed (uint principal uint (buff 65)) (response bool uint))
    (unset-agent-wallet (uint) (response bool uint))

    ;; NFT transfer (SIP-009)
    (transfer (uint principal principal) (response bool uint))

    ;; SIP-009 trait functions (response-wrapped read-only)
    (get-last-token-id () (response uint uint))
    (get-token-uri (uint) (response (optional (string-utf8 512)) uint))
    (get-owner (uint) (response (optional principal) uint))

    ;; Authorization helper (response-wrapped read-only)
    (is-authorized-or-owner (principal uint) (response bool uint))
  )
)
