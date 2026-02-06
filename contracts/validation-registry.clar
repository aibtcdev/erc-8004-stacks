;; title: validation-registry
;; version: 1.0.0
;; summary: ERC-8004 Validation Registry - Manages validation requests and responses for agents.
;; description: Allows agent owners to request validation from validators, who respond with scores.

;; traits
;;

;; token definitions
;;

;; constants
(define-constant ERR_NOT_AUTHORIZED (err u2000))
(define-constant ERR_AGENT_NOT_FOUND (err u2001))
(define-constant ERR_VALIDATION_NOT_FOUND (err u2002))
(define-constant ERR_VALIDATION_EXISTS (err u2003))
(define-constant ERR_INVALID_VALIDATOR (err u2004))
(define-constant ERR_INVALID_RESPONSE (err u2005))
(define-constant VERSION u"2.0.0")
;;

;; data vars
;;

;; data maps
(define-map validations
  {request-hash: (buff 32)}
  {
    validator: principal,
    agent-id: uint,
    response: uint,
    response-hash: (buff 32),
    tag: (string-utf8 64),
    last-update: uint,
    has-response: bool
  }
)

(define-map agent-validations {agent-id: uint} (list 1024 (buff 32)))
(define-map validator-requests {validator: principal} (list 1024 (buff 32)))
;;

;; public functions

(define-public (validation-request
  (validator principal)
  (agent-id uint)
  (request-uri (string-utf8 512))
  (request-hash (buff 32))
)
  (let (
    (caller contract-caller)
  )
    ;; Check validator is not zero address (can't check for zero in Clarity, but can check it's not caller)
    (asserts! (not (is-eq validator caller)) ERR_INVALID_VALIDATOR)
    ;; Check caller is authorized (owner or approved operator)
    (asserts! (is-authorized agent-id caller) ERR_NOT_AUTHORIZED)
    ;; Check request-hash doesn't already exist
    (asserts! (is-none (map-get? validations {request-hash: request-hash})) ERR_VALIDATION_EXISTS)
    ;; Store validation record
    (map-set validations
      {request-hash: request-hash}
      {
        validator: validator,
        agent-id: agent-id,
        response: u0,
        response-hash: 0x0000000000000000000000000000000000000000000000000000000000000000,
        tag: u"",
        last-update: stacks-block-height,
        has-response: false
      }
    )
    ;; Append to agent-validations list
    (map-set agent-validations
      {agent-id: agent-id}
      (unwrap! (as-max-len?
        (append (default-to (list) (map-get? agent-validations {agent-id: agent-id})) request-hash)
        u1024) ERR_VALIDATION_EXISTS)
    )
    ;; Append to validator-requests list
    (map-set validator-requests
      {validator: validator}
      (unwrap! (as-max-len?
        (append (default-to (list) (map-get? validator-requests {validator: validator})) request-hash)
        u1024) ERR_VALIDATION_EXISTS)
    )
    ;; Emit event
    (print {
      notification: "validation-registry/ValidationRequest",
      payload: {
        validator: validator,
        agent-id: agent-id,
        request-uri: request-uri,
        request-hash: request-hash
      }
    })
    (ok true)
  )
)

(define-public (validation-response
  (request-hash (buff 32))
  (response uint)
  (response-uri (string-utf8 512))
  (response-hash (buff 32))
  (tag (string-utf8 64))
)
  (let (
    (validation (unwrap! (map-get? validations {request-hash: request-hash}) ERR_VALIDATION_NOT_FOUND))
    (caller contract-caller)
  )
    ;; Check caller is the validator
    (asserts! (is-eq caller (get validator validation)) ERR_NOT_AUTHORIZED)
    ;; Check response is valid (0-100)
    (asserts! (<= response u100) ERR_INVALID_RESPONSE)
    ;; Update validation record (progressive: can be called multiple times)
    (map-set validations
      {request-hash: request-hash}
      (merge validation {
        response: response,
        response-hash: response-hash,
        tag: tag,
        last-update: stacks-block-height,
        has-response: true
      })
    )
    ;; Emit event
    (print {
      notification: "validation-registry/ValidationResponse",
      payload: {
        validator: (get validator validation),
        agent-id: (get agent-id validation),
        request-hash: request-hash,
        response: response,
        response-uri: response-uri,
        response-hash: response-hash,
        tag: tag
      }
    })
    (ok true)
  )
)
;;

;; read only functions

(define-read-only (get-validation-status (request-hash (buff 32)))
  (map-get? validations {request-hash: request-hash})
)

(define-read-only (get-summary
  (agent-id uint)
  (opt-validators (optional (list 200 principal)))
  (opt-tag (optional (string-utf8 64)))
)
  (let (
    (hashes (default-to (list) (map-get? agent-validations {agent-id: agent-id})))
    (result (fold summary-fold hashes {validators: opt-validators, tag: opt-tag, count: u0, total: u0}))
  )
    {
      count: (get count result),
      avg-response: (if (> (get count result) u0)
        (/ (get total result) (get count result))
        u0
      )
    }
  )
)

(define-read-only (get-agent-validations (agent-id uint))
  (map-get? agent-validations {agent-id: agent-id})
)

(define-read-only (get-validator-requests (validator principal))
  (map-get? validator-requests {validator: validator})
)

(define-read-only (get-identity-registry)
  .identity-registry
)

(define-read-only (get-version)
  VERSION
)
;;

;; private functions

(define-private (is-authorized (agent-id uint) (caller principal))
  (let (
    (owner-opt (contract-call? .identity-registry owner-of agent-id))
  )
    (match owner-opt owner
      (or
        (is-eq caller owner)
        (contract-call? .identity-registry is-approved-for-all agent-id caller)
      )
      false
    )
  )
)

(define-private (summary-fold
  (request-hash (buff 32))
  (acc {validators: (optional (list 200 principal)), tag: (optional (string-utf8 64)), count: uint, total: uint})
)
  (let (
    (validation-opt (map-get? validations {request-hash: request-hash}))
  )
    (match validation-opt validation
      (let (
        (matches-validator (match (get validators acc) validators
          (is-some (index-of? validators (get validator validation)))
          true))
        (matches-tag (match (get tag acc) filter-tag
          (is-eq filter-tag (get tag validation))
          true))
        (has-response (get has-response validation))
      )
        (if (and matches-validator matches-tag has-response)
          {
            validators: (get validators acc),
            tag: (get tag acc),
            count: (+ (get count acc) u1),
            total: (+ (get total acc) (get response validation))
          }
          acc
        )
      )
      acc
    )
  )
)
;;
