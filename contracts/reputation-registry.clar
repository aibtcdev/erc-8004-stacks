;; title: reputation-registry
;; version: 1.0.0
;; summary: ERC-8004 Reputation Registry - Client feedback for agents with SIP-018 and on-chain authorization.
;; description: Allows clients to give feedback on agents. Supports both on-chain approval and SIP-018 signed authorization.

;; traits
;;

;; token definitions
;;

;; constants
(define-constant ERR_NOT_AUTHORIZED (err u3000))
(define-constant ERR_AGENT_NOT_FOUND (err u3001))
(define-constant ERR_FEEDBACK_NOT_FOUND (err u3002))
(define-constant ERR_ALREADY_REVOKED (err u3003))
(define-constant ERR_INVALID_VALUE (err u3004))
(define-constant ERR_SELF_FEEDBACK (err u3005))
(define-constant ERR_INVALID_INDEX (err u3006))
(define-constant ERR_SIGNATURE_INVALID (err u3007))
(define-constant ERR_AUTH_EXPIRED (err u3008))
(define-constant ERR_INDEX_LIMIT_EXCEEDED (err u3009))
(define-constant ERR_EMPTY_URI (err u3010))
(define-constant ERR_INVALID_DECIMALS (err u3011))
(define-constant ERR_EMPTY_CLIENT_LIST (err u3012))
(define-constant VERSION u"2.0.0")

;; SIP-018 constants
(define-constant SIP018_PREFIX 0x534950303138)
(define-constant DOMAIN_NAME "reputation-registry")
(define-constant DOMAIN_VERSION "2.0.0")
;;

;; data vars
;;

;; data maps
(define-map feedback
  {agent-id: uint, client: principal, index: uint}
  {value: int, value-decimals: uint, tag1: (string-utf8 64), tag2: (string-utf8 64), is-revoked: bool}
)

(define-map last-index {agent-id: uint, client: principal} uint)

(define-map clients {agent-id: uint} (list 1024 principal))
(define-map client-exists {agent-id: uint, client: principal} bool)

(define-map approved-clients {agent-id: uint, client: principal} uint)

(define-map response-count {agent-id: uint, client: principal, index: uint, responder: principal} uint)
(define-map responders {agent-id: uint, client: principal, index: uint} (list 256 principal))
(define-map responder-exists {agent-id: uint, client: principal, index: uint, responder: principal} bool)
;;

;; public functions

(define-public (approve-client (agent-id uint) (client principal) (index-limit uint))
  (let (
    (caller contract-caller)
  )
    ;; Verify caller is owner or operator
    (asserts! (is-authorized agent-id caller) ERR_NOT_AUTHORIZED)
    ;; Set approval
    (map-set approved-clients {agent-id: agent-id, client: client} index-limit)
    ;; Emit event
    (print {
      notification: "reputation-registry/ClientApproved",
      payload: {
        agent-id: agent-id,
        client: client,
        index-limit: index-limit,
        approved-by: caller
      }
    })
    (ok true)
  )
)

(define-public (give-feedback
  (agent-id uint)
  (value int)
  (value-decimals uint)
  (tag1 (string-utf8 64))
  (tag2 (string-utf8 64))
  (endpoint (string-utf8 512))
  (feedback-uri (string-utf8 512))
  (feedback-hash (buff 32))
)
  (let (
    (caller contract-caller)
    (current-index (default-to u0 (map-get? last-index {agent-id: agent-id, client: caller})))
    (next-index (+ current-index u1))
    (auth-check (contract-call? .identity-registry is-authorized-or-owner caller agent-id))
  )
    ;; Verify valueDecimals is valid (0-18)
    (asserts! (<= value-decimals u18) ERR_INVALID_DECIMALS)
    ;; Verify agent exists (is-authorized-or-owner returns error if not)
    (asserts! (is-ok auth-check) ERR_AGENT_NOT_FOUND)
    ;; Verify caller is NOT authorized (prevent self-feedback)
    (asserts! (not (unwrap-panic auth-check)) ERR_SELF_FEEDBACK)
    ;; Store feedback
    (map-set feedback
      {agent-id: agent-id, client: caller, index: next-index}
      {value: value, value-decimals: value-decimals, tag1: tag1, tag2: tag2, is-revoked: false}
    )
    ;; Update last index
    (map-set last-index {agent-id: agent-id, client: caller} next-index)
    ;; Track client if new
    (if (not (default-to false (map-get? client-exists {agent-id: agent-id, client: caller})))
      (begin
        (map-set client-exists {agent-id: agent-id, client: caller} true)
        (map-set clients {agent-id: agent-id}
          (unwrap! (as-max-len?
            (append (default-to (list) (map-get? clients {agent-id: agent-id})) caller)
            u1024) ERR_NOT_AUTHORIZED))
      )
      true
    )
    ;; Emit event
    (print {
      notification: "reputation-registry/NewFeedback",
      payload: {
        agent-id: agent-id,
        client: caller,
        index: next-index,
        value: value,
        value-decimals: value-decimals,
        tag1: tag1,
        tag2: tag2,
        endpoint: endpoint,
        feedback-uri: feedback-uri,
        feedback-hash: feedback-hash
      }
    })
    (ok next-index)
  )
)

(define-public (give-feedback-approved
  (agent-id uint)
  (value int)
  (value-decimals uint)
  (tag1 (string-utf8 64))
  (tag2 (string-utf8 64))
  (endpoint (string-utf8 512))
  (feedback-uri (string-utf8 512))
  (feedback-hash (buff 32))
)
  (let (
    (caller contract-caller)
    (current-index (default-to u0 (map-get? last-index {agent-id: agent-id, client: caller})))
    (next-index (+ current-index u1))
    (approved-limit (default-to u0 (map-get? approved-clients {agent-id: agent-id, client: caller})))
  )
    ;; Verify valueDecimals is valid (0-18)
    (asserts! (<= value-decimals u18) ERR_INVALID_DECIMALS)
    ;; Verify agent exists
    (asserts! (is-some (contract-call? .identity-registry owner-of agent-id)) ERR_AGENT_NOT_FOUND)
    ;; Verify caller is NOT owner or operator (prevent self-feedback)
    (asserts! (not (is-authorized agent-id caller)) ERR_SELF_FEEDBACK)
    ;; Verify caller has on-chain approval with sufficient limit
    (asserts! (>= approved-limit next-index) ERR_INDEX_LIMIT_EXCEEDED)
    ;; Store feedback
    (map-set feedback
      {agent-id: agent-id, client: caller, index: next-index}
      {value: value, value-decimals: value-decimals, tag1: tag1, tag2: tag2, is-revoked: false}
    )
    ;; Update last index
    (map-set last-index {agent-id: agent-id, client: caller} next-index)
    ;; Track client if new
    (if (not (default-to false (map-get? client-exists {agent-id: agent-id, client: caller})))
      (begin
        (map-set client-exists {agent-id: agent-id, client: caller} true)
        (map-set clients {agent-id: agent-id}
          (unwrap! (as-max-len?
            (append (default-to (list) (map-get? clients {agent-id: agent-id})) caller)
            u1024) ERR_NOT_AUTHORIZED))
      )
      true
    )
    ;; Emit event
    (print {
      notification: "reputation-registry/NewFeedback",
      payload: {
        agent-id: agent-id,
        client: caller,
        index: next-index,
        value: value,
        value-decimals: value-decimals,
        tag1: tag1,
        tag2: tag2,
        endpoint: endpoint,
        feedback-uri: feedback-uri,
        feedback-hash: feedback-hash
      }
    })
    (ok next-index)
  )
)

(define-public (give-feedback-signed
  (agent-id uint)
  (value int)
  (value-decimals uint)
  (tag1 (string-utf8 64))
  (tag2 (string-utf8 64))
  (endpoint (string-utf8 512))
  (feedback-uri (string-utf8 512))
  (feedback-hash (buff 32))
  (signer principal)
  (index-limit uint)
  (expiry uint)
  (signature (buff 65))
)
  (let (
    (caller contract-caller)
    (current-index (default-to u0 (map-get? last-index {agent-id: agent-id, client: caller})))
    (next-index (+ current-index u1))
  )
    ;; Verify valueDecimals is valid (0-18)
    (asserts! (<= value-decimals u18) ERR_INVALID_DECIMALS)
    ;; Verify agent exists
    (asserts! (is-some (contract-call? .identity-registry owner-of agent-id)) ERR_AGENT_NOT_FOUND)
    ;; Verify caller is NOT owner or operator (prevent self-feedback)
    (asserts! (not (is-authorized agent-id caller)) ERR_SELF_FEEDBACK)
    ;; Verify expiry
    (asserts! (> expiry stacks-block-height) ERR_AUTH_EXPIRED)
    ;; Verify index limit
    (asserts! (>= index-limit next-index) ERR_INDEX_LIMIT_EXCEEDED)
    ;; Verify signer is authorized (owner or operator)
    (asserts! (is-authorized agent-id signer) ERR_NOT_AUTHORIZED)
    ;; Verify SIP-018 signature
    (asserts! (verify-sip018-auth agent-id caller index-limit expiry signer signature) ERR_SIGNATURE_INVALID)
    ;; Store feedback
    (map-set feedback
      {agent-id: agent-id, client: caller, index: next-index}
      {value: value, value-decimals: value-decimals, tag1: tag1, tag2: tag2, is-revoked: false}
    )
    ;; Update last index
    (map-set last-index {agent-id: agent-id, client: caller} next-index)
    ;; Track client if new
    (if (not (default-to false (map-get? client-exists {agent-id: agent-id, client: caller})))
      (begin
        (map-set client-exists {agent-id: agent-id, client: caller} true)
        (map-set clients {agent-id: agent-id}
          (unwrap! (as-max-len?
            (append (default-to (list) (map-get? clients {agent-id: agent-id})) caller)
            u1024) ERR_NOT_AUTHORIZED))
      )
      true
    )
    ;; Emit event
    (print {
      notification: "reputation-registry/NewFeedback",
      payload: {
        agent-id: agent-id,
        client: caller,
        index: next-index,
        value: value,
        value-decimals: value-decimals,
        tag1: tag1,
        tag2: tag2,
        endpoint: endpoint,
        feedback-uri: feedback-uri,
        feedback-hash: feedback-hash
      }
    })
    (ok next-index)
  )
)

(define-public (revoke-feedback (agent-id uint) (index uint))
  (let (
    (caller contract-caller)
    (fb (unwrap! (map-get? feedback {agent-id: agent-id, client: caller, index: index}) ERR_FEEDBACK_NOT_FOUND))
  )
    ;; Verify index is valid (> 0)
    (asserts! (> index u0) ERR_INVALID_INDEX)
    ;; Verify not already revoked
    (asserts! (not (get is-revoked fb)) ERR_ALREADY_REVOKED)
    ;; Mark as revoked
    (map-set feedback
      {agent-id: agent-id, client: caller, index: index}
      (merge fb {is-revoked: true})
    )
    ;; Emit event
    (print {
      notification: "reputation-registry/FeedbackRevoked",
      payload: {
        agent-id: agent-id,
        client: caller,
        index: index
      }
    })
    (ok true)
  )
)

(define-public (append-response
  (agent-id uint)
  (client principal)
  (index uint)
  (response-uri (string-utf8 512))
  (response-hash (buff 32))
)
  (let (
    (responder contract-caller)
    (client-last-idx (default-to u0 (map-get? last-index {agent-id: agent-id, client: client})))
  )
    ;; Verify index is valid
    (asserts! (> index u0) ERR_INVALID_INDEX)
    (asserts! (<= index client-last-idx) ERR_FEEDBACK_NOT_FOUND)
    ;; Verify URI is not empty
    (asserts! (> (len response-uri) u0) ERR_EMPTY_URI)
    ;; Track responder if new
    (if (not (default-to false (map-get? responder-exists {agent-id: agent-id, client: client, index: index, responder: responder})))
      (begin
        (map-set responder-exists {agent-id: agent-id, client: client, index: index, responder: responder} true)
        (map-set responders {agent-id: agent-id, client: client, index: index}
          (unwrap! (as-max-len?
            (append (default-to (list) (map-get? responders {agent-id: agent-id, client: client, index: index})) responder)
            u256) ERR_NOT_AUTHORIZED))
      )
      true
    )
    ;; Increment response count
    (map-set response-count
      {agent-id: agent-id, client: client, index: index, responder: responder}
      (+ u1 (default-to u0 (map-get? response-count {agent-id: agent-id, client: client, index: index, responder: responder})))
    )
    ;; Emit event
    (print {
      notification: "reputation-registry/ResponseAppended",
      payload: {
        agent-id: agent-id,
        client: client,
        index: index,
        responder: responder,
        response-uri: response-uri,
        response-hash: response-hash
      }
    })
    (ok true)
  )
)
;;

;; read only functions

(define-read-only (read-feedback (agent-id uint) (client principal) (index uint))
  (map-get? feedback {agent-id: agent-id, client: client, index: index})
)

(define-read-only (get-summary
  (agent-id uint)
  (client-addresses (list 200 principal))
  (tag1 (string-utf8 64))
  (tag2 (string-utf8 64))
)
  (let (
    ;; Validate non-empty client list (return empty summary if empty)
    (list-len (len client-addresses))
  )
    (if (is-eq list-len u0)
      ;; Empty list: return empty summary
      {count: u0, summary-value: 0, summary-value-decimals: u0}
      ;; Process feedback
      (let (
        ;; Initialize frequency list with 19 zeros
        (init-freq (list u0 u0 u0 u0 u0 u0 u0 u0 u0 u0 u0 u0 u0 u0 u0 u0 u0 u0 u0))
        ;; Fold over clients to accumulate WAD-normalized values
        (result (fold summary-fold
          client-addresses
          {
            agent-id: agent-id,
            tag1: tag1,
            tag2: tag2,
            count: u0,
            wad-sum: 0,
            decimal-freq: init-freq,
            client: tx-sender,
            last-idx: u0
          }
        ))
        (count (get count result))
        (wad-sum (get wad-sum result))
        (decimal-freq (get decimal-freq result))
      )
        (if (is-eq count u0)
          ;; No matching feedback
          {count: u0, summary-value: 0, summary-value-decimals: u0}
          ;; Calculate average and scale back
          (let (
            (avg-wad (/ wad-sum (to-int count)))
            (mode-decimals (find-mode-decimals decimal-freq))
            (summary-value (scale-from-wad avg-wad mode-decimals))
          )
            {
              count: count,
              summary-value: summary-value,
              summary-value-decimals: mode-decimals
            }
          )
        )
      )
    )
  )
)

(define-read-only (get-last-index (agent-id uint) (client principal))
  (default-to u0 (map-get? last-index {agent-id: agent-id, client: client}))
)

(define-read-only (get-clients (agent-id uint))
  (map-get? clients {agent-id: agent-id})
)

;; Legacy single response count (kept for backwards compatibility)
(define-read-only (get-response-count-single (agent-id uint) (client principal) (index uint) (responder principal))
  (default-to u0 (map-get? response-count {agent-id: agent-id, client: client, index: index, responder: responder}))
)

;; Flexible response count with optional filters
(define-read-only (get-response-count
  (agent-id uint)
  (opt-client (optional principal))
  (opt-feedback-index (optional uint))
  (opt-responders (optional (list 200 principal)))
)
  (match opt-client
    ;; Client specified: count for that client
    client-val
      (let ((last-idx (get-last-index agent-id client-val)))
        (match opt-feedback-index
          ;; Specific feedback index
          idx-val
            (if (or (is-eq idx-val u0) (> idx-val last-idx))
              ;; Index 0 or invalid: count all feedback for this client
              (get total (fold count-all-feedback-fold
                (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10)
                {agent-id: agent-id, client: client-val, last-idx: last-idx, responders: opt-responders, total: u0, current-idx: u0}))
              ;; Specific index: count for that feedback
              (match opt-responders
                responder-list (get total (fold count-responder-fold responder-list {agent-id: agent-id, client: client-val, index: idx-val, total: u0}))
                (get total (fold count-all-responders-fold
                  (default-to (list) (get-responders agent-id client-val idx-val))
                  {agent-id: agent-id, client: client-val, index: idx-val, total: u0}))
              )
            )
          ;; No index: count all feedback for this client
          (get total (fold count-all-feedback-fold
            (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10)
            {agent-id: agent-id, client: client-val, last-idx: last-idx, responders: opt-responders, total: u0, current-idx: u0}))
        )
      )
    ;; No client: count across all clients
    (let ((client-list (default-to (list) (get-clients agent-id))))
      (get total (fold count-all-clients-fold
        client-list
        {agent-id: agent-id, opt-feedback-index: opt-feedback-index, opt-responders: opt-responders, total: u0}))
    )
  )
)

(define-read-only (get-approved-limit (agent-id uint) (client principal))
  (default-to u0 (map-get? approved-clients {agent-id: agent-id, client: client}))
)

(define-read-only (read-all-feedback
  (agent-id uint)
  (opt-clients (optional (list 50 principal)))
  (opt-tag1 (optional (string-utf8 64)))
  (opt-tag2 (optional (string-utf8 64)))
  (include-revoked bool)
)
  (let (
    (client-list (default-to (default-to (list) (map-get? clients {agent-id: agent-id})) opt-clients))
  )
    (get items (fold read-all-client-fold
      client-list
      {
        agent-id: agent-id,
        tag1: opt-tag1,
        tag2: opt-tag2,
        include-revoked: include-revoked,
        client: tx-sender,
        last-idx: u0,
        items: (list)
      }
    ))
  )
)

(define-read-only (get-responders (agent-id uint) (client principal) (index uint))
  (map-get? responders {agent-id: agent-id, client: client, index: index})
)

(define-read-only (get-identity-registry)
  .identity-registry
)

(define-read-only (get-version)
  VERSION
)

;; SIP-018 message hash for verification (exposed for off-chain tooling)
(define-read-only (get-auth-message-hash
  (agent-id uint)
  (client principal)
  (index-limit uint)
  (expiry uint)
  (signer principal)
)
  (make-sip018-message-hash agent-id client index-limit expiry signer)
)
;;

;; private functions

;; WAD normalization helpers (18-decimal precision)

(define-private (normalize-to-wad (value int) (decimals uint))
  ;; Normalize value to 18 decimals: value * 10^(18 - decimals)
  (if (>= decimals u18)
    value
    (* value (to-int (pow u10 (- u18 decimals))))
  )
)

(define-private (scale-from-wad (wad-value int) (target-decimals uint))
  ;; Scale from 18 decimals to target: wad-value / 10^(18 - target-decimals)
  (if (>= target-decimals u18)
    wad-value
    (/ wad-value (to-int (pow u10 (- u18 target-decimals))))
  )
)

(define-private (find-mode-decimals (freq-list (list 19 uint)))
  ;; Find index with maximum count (most frequent decimals)
  (get mode-idx (fold find-mode-fold
    freq-list
    {mode-idx: u0, mode-count: u0, current-idx: u0}
  ))
)

(define-private (find-mode-fold
  (count uint)
  (acc {mode-idx: uint, mode-count: uint, current-idx: uint})
)
  (let (
    (new-idx (+ (get current-idx acc) u1))
  )
    (if (> count (get mode-count acc))
      {mode-idx: (get current-idx acc), mode-count: count, current-idx: new-idx}
      (merge acc {current-idx: new-idx})
    )
  )
)

(define-private (increment-freq (freq-list (list 19 uint)) (decimals uint))
  ;; Increment count at index=decimals in frequency list
  (if (> decimals u18)
    freq-list
    (let (
      (current-count (default-to u0 (element-at? freq-list decimals)))
      (new-count (+ current-count u1))
    )
      (default-to freq-list (replace-at? freq-list decimals new-count))
    )
  )
)

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

(define-private (verify-sip018-auth
  (agent-id uint)
  (client principal)
  (index-limit uint)
  (expiry uint)
  (signer principal)
  (signature (buff 65))
)
  (let (
    (message-hash (make-sip018-message-hash agent-id client index-limit expiry signer))
  )
    (match (secp256k1-recover? message-hash signature)
      pubkey
      ;; Compare recovered pubkey to signer's expected pubkey
      ;; principal-of? converts pubkey to principal for comparison
      (match (principal-of? pubkey)
        recovered-principal (is-eq recovered-principal signer)
        err-code false
      )
      err-code false
    )
  )
)

(define-private (make-sip018-message-hash
  (agent-id uint)
  (client principal)
  (index-limit uint)
  (expiry uint)
  (signer principal)
)
  (let (
    (domain-hash (sha256 (unwrap-panic (to-consensus-buff? {
      name: DOMAIN_NAME,
      version: DOMAIN_VERSION,
      chain-id: chain-id
    }))))
    (structured-data-hash (sha256 (unwrap-panic (to-consensus-buff? {
      agent-id: agent-id,
      client: client,
      index-limit: index-limit,
      expiry: expiry,
      signer: signer
    }))))
  )
    (sha256 (concat SIP018_PREFIX (concat domain-hash structured-data-hash)))
  )
)

(define-private (read-all-client-fold
  (client principal)
  (acc {
    agent-id: uint,
    tag1: (optional (string-utf8 64)),
    tag2: (optional (string-utf8 64)),
    include-revoked: bool,
    client: principal,
    last-idx: uint,
    items: (list 50 {client: principal, index: uint, value: int, value-decimals: uint, tag1: (string-utf8 64), tag2: (string-utf8 64), is-revoked: bool})
  })
)
  (let (
    (agent-id (get agent-id acc))
    (last-idx (default-to u0 (map-get? last-index {agent-id: agent-id, client: client})))
  )
    (fold read-all-index-fold
      (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10)
      (merge acc {client: client, last-idx: last-idx})
    )
  )
)

(define-private (read-all-index-fold
  (idx uint)
  (acc {
    agent-id: uint,
    tag1: (optional (string-utf8 64)),
    tag2: (optional (string-utf8 64)),
    include-revoked: bool,
    client: principal,
    last-idx: uint,
    items: (list 50 {client: principal, index: uint, value: int, value-decimals: uint, tag1: (string-utf8 64), tag2: (string-utf8 64), is-revoked: bool})
  })
)
  (if (or (> idx (get last-idx acc)) (>= (len (get items acc)) u50))
    acc
    (let (
      (fb-opt (map-get? feedback {agent-id: (get agent-id acc), client: (get client acc), index: idx}))
    )
      (match fb-opt fb
        (let (
          (dominated-by-revoked (and (get is-revoked fb) (not (get include-revoked acc))))
          (matches-tag1 (match (get tag1 acc) filter-tag1
            (is-eq filter-tag1 (get tag1 fb))
            true))
          (matches-tag2 (match (get tag2 acc) filter-tag2
            (is-eq filter-tag2 (get tag2 fb))
            true))
        )
          (if (and (not dominated-by-revoked) matches-tag1 matches-tag2)
            (match (as-max-len? (append (get items acc) {
              client: (get client acc),
              index: idx,
              value: (get value fb),
              value-decimals: (get value-decimals fb),
              tag1: (get tag1 fb),
              tag2: (get tag2 fb),
              is-revoked: (get is-revoked fb)
            }) u50)
              new-items (merge acc {items: new-items})
              acc
            )
            acc
          )
        )
        acc
      )
    )
  )
)

(define-private (summary-fold
  (client principal)
  (acc {agent-id: uint, tag1: (string-utf8 64), tag2: (string-utf8 64), count: uint, wad-sum: int, decimal-freq: (list 19 uint), client: principal, last-idx: uint})
)
  (let (
    (agent-id (get agent-id acc))
    (last-idx (default-to u0 (map-get? last-index {agent-id: agent-id, client: client})))
  )
    (fold summary-index-fold
      (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10)
      (merge acc {client: client, last-idx: last-idx})
    )
  )
)

(define-private (summary-index-fold
  (idx uint)
  (acc {agent-id: uint, tag1: (string-utf8 64), tag2: (string-utf8 64), count: uint, wad-sum: int, decimal-freq: (list 19 uint), client: principal, last-idx: uint})
)
  (if (> idx (get last-idx acc))
    acc
    (let (
      (fb-opt (map-get? feedback {agent-id: (get agent-id acc), client: (get client acc), index: idx}))
    )
      (match fb-opt fb
        (if (get is-revoked fb)
          acc
          (let (
            ;; Tag matching: empty string means no filter
            (matches-tag1 (if (is-eq (get tag1 acc) u"")
              true
              (is-eq (get tag1 acc) (get tag1 fb))
            ))
            (matches-tag2 (if (is-eq (get tag2 acc) u"")
              true
              (is-eq (get tag2 acc) (get tag2 fb))
            ))
          )
            (if (and matches-tag1 matches-tag2)
              (let (
                ;; Normalize value to WAD (18 decimals)
                (normalized-value (normalize-to-wad (get value fb) (get value-decimals fb)))
                ;; Increment frequency count for this decimals value
                (new-freq (increment-freq (get decimal-freq acc) (get value-decimals fb)))
              )
                (merge acc {
                  count: (+ (get count acc) u1),
                  wad-sum: (+ (get wad-sum acc) normalized-value),
                  decimal-freq: new-freq
                })
              )
              acc
            )
          )
        )
        acc
      )
    )
  )
)

;; Response count fold helpers

(define-private (count-all-clients-fold
  (client principal)
  (acc {agent-id: uint, opt-feedback-index: (optional uint), opt-responders: (optional (list 200 principal)), total: uint})
)
  (let (
    (agent-id (get agent-id acc))
    (last-idx (get-last-index agent-id client))
  )
    (match (get opt-feedback-index acc)
      ;; Specific feedback index
      idx-val
        (if (or (is-eq idx-val u0) (> idx-val last-idx))
          ;; Index 0 or invalid: count all feedback for this client
          (merge acc {total: (+ (get total acc)
            (get total (fold count-all-feedback-fold
              (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10)
              {agent-id: agent-id, client: client, last-idx: last-idx, responders: (get opt-responders acc), total: u0, current-idx: u0})))})
          ;; Specific index: count for that feedback
          (merge acc {total: (+ (get total acc)
            (match (get opt-responders acc)
              responder-list (get total (fold count-responder-fold responder-list {agent-id: agent-id, client: client, index: idx-val, total: u0}))
              (get total (fold count-all-responders-fold
                (default-to (list) (get-responders agent-id client idx-val))
                {agent-id: agent-id, client: client, index: idx-val, total: u0}))
            ))})
        )
      ;; No index: count all feedback for this client
      (merge acc {total: (+ (get total acc)
        (get total (fold count-all-feedback-fold
          (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10)
          {agent-id: agent-id, client: client, last-idx: last-idx, responders: (get opt-responders acc), total: u0, current-idx: u0})))})
    )
  )
)

(define-private (count-all-feedback-fold
  (idx uint)
  (acc {agent-id: uint, client: principal, last-idx: uint, responders: (optional (list 200 principal)), total: uint, current-idx: uint})
)
  (if (> idx (get last-idx acc))
    acc
    (let (
      (responders-for-idx (default-to (list) (get-responders (get agent-id acc) (get client acc) idx)))
    )
      (merge acc {total: (+ (get total acc)
        (match (get responders acc)
          responder-list (get total (fold count-responder-fold responder-list {agent-id: (get agent-id acc), client: (get client acc), index: idx, total: u0}))
          (get total (fold count-all-responders-fold responders-for-idx {agent-id: (get agent-id acc), client: (get client acc), index: idx, total: u0}))
        ))})
    )
  )
)

(define-private (count-responder-fold
  (responder principal)
  (acc {agent-id: uint, client: principal, index: uint, total: uint})
)
  (merge acc {total: (+ (get total acc)
    (get-response-count-single (get agent-id acc) (get client acc) (get index acc) responder))})
)

(define-private (count-all-responders-fold
  (responder principal)
  (acc {agent-id: uint, client: principal, index: uint, total: uint})
)
  (merge acc {total: (+ (get total acc)
    (get-response-count-single (get agent-id acc) (get client acc) (get index acc) responder))})
)
;;
