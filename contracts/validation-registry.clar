;; title: validation-registry
;; version: 2.0.0
;; summary: ERC-8004 Validation Registry - Manages validation requests and responses for agents.
;; description: Allows agent owners to request validation from validators, who respond with scores.
;; auth: All authorization checks use tx-sender. Contract principals acting as validators must use as-contract.

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

;; Page size for list pagination (read-only functions)
;; Set to 15 to stay within mainnet 30-read limit (15 items x 2 reads = 30)
(define-constant PAGE_SIZE u15)
(define-constant PAGE_INDEX_LIST (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14 u15))
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

;; Agent validation tracking with counter+indexed-map pattern
(define-map agent-validation-count {agent-id: uint} uint)
(define-map agent-validation-at-index {agent-id: uint, index: uint} (buff 32))

;; Validator request tracking with counter+indexed-map pattern
(define-map validator-request-count {validator: principal} uint)
(define-map validator-request-at-index {validator: principal, index: uint} (buff 32))
;;

;; public functions

(define-public (validation-request
  (validator principal)
  (agent-id uint)
  (request-uri (string-utf8 512))
  (request-hash (buff 32))
)
  (let (
    (caller tx-sender)
  )
    ;; Check validator is not the caller (prevents self-validation)
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
    ;; Append to agent-validations using counter+indexed-map
    (let (
      (agent-current-count (default-to u0 (map-get? agent-validation-count {agent-id: agent-id})))
      (agent-next-count (+ agent-current-count u1))
      (validator-current-count (default-to u0 (map-get? validator-request-count {validator: validator})))
      (validator-next-count (+ validator-current-count u1))
    )
      (map-set agent-validation-count {agent-id: agent-id} agent-next-count)
      (map-set agent-validation-at-index {agent-id: agent-id, index: agent-next-count} request-hash)
      (map-set validator-request-count {validator: validator} validator-next-count)
      (map-set validator-request-at-index {validator: validator, index: validator-next-count} request-hash)
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
    (caller tx-sender)
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
    ;; Get first page of validations (up to 15 hashes)
    (hashes (get validations (get-agent-validations agent-id none)))
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

(define-read-only (get-agent-validations (agent-id uint) (opt-cursor (optional uint)))
  (let (
    (total-count (default-to u0 (map-get? agent-validation-count {agent-id: agent-id})))
    (cursor-offset (default-to u0 opt-cursor))
    (page-end (+ cursor-offset PAGE_SIZE))
    (has-more (> total-count page-end))
    (result (fold build-validation-list-fold
      PAGE_INDEX_LIST
      {agent-id: agent-id, cursor-offset: cursor-offset, total-count: total-count, validations: (list)}
    ))
  )
    {
      validations: (get validations result),
      cursor: (if has-more (some page-end) none)
    }
  )
)

(define-read-only (get-validator-requests (validator principal) (opt-cursor (optional uint)))
  (let (
    (total-count (default-to u0 (map-get? validator-request-count {validator: validator})))
    (cursor-offset (default-to u0 opt-cursor))
    (page-end (+ cursor-offset PAGE_SIZE))
    (has-more (> total-count page-end))
    (result (fold build-request-list-fold
      PAGE_INDEX_LIST
      {validator: validator, cursor-offset: cursor-offset, total-count: total-count, requests: (list)}
    ))
  )
    {
      requests: (get requests result),
      cursor: (if has-more (some page-end) none)
    }
  )
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

;; Helper for building paginated agent validation lists
(define-private (build-validation-list-fold
  (idx uint)
  (acc {agent-id: uint, cursor-offset: uint, total-count: uint, validations: (list 15 (buff 32))})
)
  (let ((actual-idx (+ idx (get cursor-offset acc))))
    (if (> actual-idx (get total-count acc))
      acc
      (let (
        (hash-opt (map-get? agent-validation-at-index {agent-id: (get agent-id acc), index: actual-idx}))
      )
        (match hash-opt hash
          (match (as-max-len? (append (get validations acc) hash) u15)
            new-validations (merge acc {validations: new-validations})
            acc
          )
          acc
        )
      )
    )
  )
)

;; Helper for building paginated validator request lists
(define-private (build-request-list-fold
  (idx uint)
  (acc {validator: principal, cursor-offset: uint, total-count: uint, requests: (list 15 (buff 32))})
)
  (let ((actual-idx (+ idx (get cursor-offset acc))))
    (if (> actual-idx (get total-count acc))
      acc
      (let (
        (hash-opt (map-get? validator-request-at-index {validator: (get validator acc), index: actual-idx}))
      )
        (match hash-opt hash
          (match (as-max-len? (append (get requests acc) hash) u15)
            new-requests (merge acc {requests: new-requests})
            acc
          )
          acc
        )
      )
    )
  )
)
;;
