;; title: validation-registry-trait
;; version: 2.0.0
;; summary: Trait definition for ERC-8004 Validation Registry
;; description: Defines the interface for validation registry contracts. Includes all public state-changing functions. Read-only functions are not included as they return raw types (tuples, optionals).

(define-trait validation-registry-trait
  (
    ;; Validation request
    (validation-request (principal uint (string-utf8 512) (buff 32)) (response bool uint))

    ;; Validation response
    (validation-response ((buff 32) uint (string-utf8 512) (buff 32) (string-utf8 64)) (response bool uint))
  )
)
