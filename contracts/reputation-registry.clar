;; title: reputation-registry
;; version: 2.0.0
;; summary: ERC-8004 Reputation Registry - Client feedback for agents with SIP-018 and on-chain authorization.
;; description: Allows clients to give feedback on agents. Supports both on-chain approval and SIP-018 signed authorization.
;; auth: All authorization checks use tx-sender. Contract principals acting as owners/operators must use as-contract.
;;
;; ERC-8004 Spec Compliance
;; ========================
;;
;; Spec Function/Feature              | Implementation                    | Notes
;; ------------------------------------|-----------------------------------|------
;; initialize(identityRegistry)        | Hardcoded .identity-registry      | Deploy-time binding (Clarity convention)
;; getIdentityRegistry()               | get-identity-registry             | Exact match
;; giveFeedback(agentId, value,        | give-feedback                     | Exact match (permissionless)
;;   valueDecimals, tag1, tag2,        | give-feedback-approved            | Stacks enhancement: on-chain approval path
;;   endpoint, feedbackURI,            | give-feedback-signed              | Stacks enhancement: SIP-018 signed auth
;;   feedbackHash)                     |                                   |
;; valueDecimals 0-18 validation       | asserts! (<= value-decimals u18)  | Exact match
;; Self-feedback blocked               | Cross-contract is-authorized-or-owner on tx-sender | Exact match
;; endpoint/feedbackURI/feedbackHash   | Emitted in SIP-019 print only     | Exact match (not stored)
;; value/valueDecimals/tag1/tag2       | Stored in feedback map            | Exact match
;; wad-value (WAD normalization)       | Stored per-feedback               | Stacks enhancement: O(1) aggregation
;; NewFeedback event                   | SIP-019 print (all spec fields)   | Stacks equivalent of EVM event
;; revokeFeedback(agentId, index)      | revoke-feedback                   | Exact match (client = tx-sender)
;; FeedbackRevoked event               | SIP-019 print + value/decimals    | Superset (enriched for indexer)
;; appendResponse(agentId, client,     | append-response                   | Exact match (permissionless)
;;   index, responseURI, responseHash) |                                   |
;; ResponseAppended event              | SIP-019 print                     | Stacks equivalent of EVM event
;; readFeedback(agentId, client, idx)  | read-feedback                     | Returns optional (Clarity convention)
;; readAllFeedback(agentId,            | read-all-feedback                 | Adapted: global sequence + cursor
;;   clientAddresses[], tag1, tag2,    |   (opt-tag1, opt-tag2,            | No clientAddresses[] param
;;   includeRevoked)                   |    include-revoked, opt-cursor)   | Tag filtering on-chain, page size 14
;; getSummary(agentId,                 | get-summary(agent-id)             | Adapted: O(1) running totals, no filters
;;   clientAddresses[], tag1, tag2)    |                                   | Filtered aggregation via SIP-019 indexer
;; getResponseCount(agentId, client,   | get-response-count                | Superset: optional params + cursor
;;   index, responders[])              |                                   |
;; getClients(agentId)                 | get-clients(agent-id, opt-cursor) | Superset: cursor pagination
;; getLastIndex(agentId, client)       | get-last-index                    | Exact match
;; (no EVM equivalent)                 | approve-client                    | Stacks enhancement: on-chain approval
;; (no EVM equivalent)                 | get-approved-limit                | Stacks enhancement: query approval
;; (no EVM equivalent)                 | get-agent-feedback-count          | Stacks enhancement: global count
;; (no EVM equivalent)                 | get-responders                    | Stacks enhancement: responder list
;; (no EVM equivalent)                 | get-auth-message-hash             | Stacks enhancement: off-chain tooling

;; traits
(impl-trait .reputation-registry-trait.reputation-registry-trait)
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

;; Page size for list pagination (read-only functions)
;; Set to 14 to stay within mainnet default read_only_call_limit_read_count = 30
;; Single-read fns: 1 counter + 14 items = 15 reads
;; Double-read fns (read-all-feedback): 1 counter + 14 items x 2 = 29 reads
(define-constant PAGE_SIZE u14)
(define-constant PAGE_INDEX_LIST (list u1 u2 u3 u4 u5 u6 u7 u8 u9 u10 u11 u12 u13 u14))

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
  {value: int, value-decimals: uint, wad-value: int, tag1: (string-utf8 64), tag2: (string-utf8 64), is-revoked: bool}
)

(define-map last-index {agent-id: uint, client: principal} uint)

;; Client tracking with counter+indexed-map pattern
(define-map client-count {agent-id: uint} uint)
(define-map client-at-index {agent-id: uint, index: uint} principal)
(define-map client-exists {agent-id: uint, client: principal} bool)

(define-map approved-clients {agent-id: uint, client: principal} uint)

(define-map response-count {agent-id: uint, client: principal, index: uint, responder: principal} uint)

;; Responder tracking with counter+indexed-map pattern
(define-map responder-count {agent-id: uint, client: principal, index: uint} uint)
(define-map responder-at-index {agent-id: uint, client: principal, index: uint, responder-index: uint} principal)
(define-map responder-exists {agent-id: uint, client: principal, index: uint, responder: principal} bool)

;; Global feedback sequence for cross-client pagination
(define-map last-global-index {agent-id: uint} uint)
(define-map global-feedback-index {agent-id: uint, global-index: uint} {client: principal, client-index: uint})

;; Running totals for O(1) unfiltered summary
(define-map agent-summary {agent-id: uint} {count: uint, wad-sum: int})
;;

;; public functions

(define-public (approve-client (agent-id uint) (client principal) (index-limit uint))
  (let (
    (caller tx-sender)
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
    (caller tx-sender)
    (current-index (default-to u0 (map-get? last-index {agent-id: agent-id, client: caller})))
    (next-index (+ current-index u1))
    (auth-check (contract-call? .identity-registry is-authorized-or-owner caller agent-id))
    (current-global-index (default-to u0 (map-get? last-global-index {agent-id: agent-id})))
    (next-global-index (+ current-global-index u1))
  )
    ;; Verify valueDecimals is valid (0-18)
    (asserts! (<= value-decimals u18) ERR_INVALID_DECIMALS)
    ;; Verify agent exists (is-authorized-or-owner returns error if not)
    (asserts! (is-ok auth-check) ERR_AGENT_NOT_FOUND)
    ;; Verify caller is NOT authorized (prevent self-feedback)
    (asserts! (not (unwrap-panic auth-check)) ERR_SELF_FEEDBACK)
    ;; Compute and store WAD value for revocation
    (let ((wad-val (normalize-to-wad value value-decimals)))
      (map-set feedback
        {agent-id: agent-id, client: caller, index: next-index}
        {value: value, value-decimals: value-decimals, wad-value: wad-val, tag1: tag1, tag2: tag2, is-revoked: false}
      )
      ;; Update running totals
      (let (
        (current-summary (default-to {count: u0, wad-sum: 0} (map-get? agent-summary {agent-id: agent-id})))
      )
        (map-set agent-summary {agent-id: agent-id}
          {count: (+ (get count current-summary) u1), wad-sum: (+ (get wad-sum current-summary) wad-val)}
        )
      )
    )
    ;; Update last index
    (map-set last-index {agent-id: agent-id, client: caller} next-index)
    ;; Update global sequence
    (map-set global-feedback-index {agent-id: agent-id, global-index: next-global-index} {client: caller, client-index: next-index})
    (map-set last-global-index {agent-id: agent-id} next-global-index)
    ;; Track client if new
    (if (not (default-to false (map-get? client-exists {agent-id: agent-id, client: caller})))
      (let (
        (current-count (default-to u0 (map-get? client-count {agent-id: agent-id})))
        (next-count (+ current-count u1))
      )
        (map-set client-exists {agent-id: agent-id, client: caller} true)
        (map-set client-count {agent-id: agent-id} next-count)
        (map-set client-at-index {agent-id: agent-id, index: next-count} caller)
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
    (caller tx-sender)
    (current-index (default-to u0 (map-get? last-index {agent-id: agent-id, client: caller})))
    (next-index (+ current-index u1))
    (approved-limit (default-to u0 (map-get? approved-clients {agent-id: agent-id, client: caller})))
    (auth-check (contract-call? .identity-registry is-authorized-or-owner caller agent-id))
    (current-global-index (default-to u0 (map-get? last-global-index {agent-id: agent-id})))
    (next-global-index (+ current-global-index u1))
  )
    ;; Verify valueDecimals is valid (0-18)
    (asserts! (<= value-decimals u18) ERR_INVALID_DECIMALS)
    ;; Verify agent exists (is-authorized-or-owner returns error if not)
    (asserts! (is-ok auth-check) ERR_AGENT_NOT_FOUND)
    ;; Verify caller is NOT authorized (prevent self-feedback)
    (asserts! (not (unwrap-panic auth-check)) ERR_SELF_FEEDBACK)
    ;; Verify caller has on-chain approval with sufficient limit
    (asserts! (>= approved-limit next-index) ERR_INDEX_LIMIT_EXCEEDED)
    ;; Compute and store WAD value for revocation
    (let ((wad-val (normalize-to-wad value value-decimals)))
      (map-set feedback
        {agent-id: agent-id, client: caller, index: next-index}
        {value: value, value-decimals: value-decimals, wad-value: wad-val, tag1: tag1, tag2: tag2, is-revoked: false}
      )
      ;; Update running totals
      (let (
        (current-summary (default-to {count: u0, wad-sum: 0} (map-get? agent-summary {agent-id: agent-id})))
      )
        (map-set agent-summary {agent-id: agent-id}
          {count: (+ (get count current-summary) u1), wad-sum: (+ (get wad-sum current-summary) wad-val)}
        )
      )
    )
    ;; Update last index
    (map-set last-index {agent-id: agent-id, client: caller} next-index)
    ;; Update global sequence
    (map-set global-feedback-index {agent-id: agent-id, global-index: next-global-index} {client: caller, client-index: next-index})
    (map-set last-global-index {agent-id: agent-id} next-global-index)
    ;; Track client if new
    (if (not (default-to false (map-get? client-exists {agent-id: agent-id, client: caller})))
      (let (
        (current-count (default-to u0 (map-get? client-count {agent-id: agent-id})))
        (next-count (+ current-count u1))
      )
        (map-set client-exists {agent-id: agent-id, client: caller} true)
        (map-set client-count {agent-id: agent-id} next-count)
        (map-set client-at-index {agent-id: agent-id, index: next-count} caller)
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
    (caller tx-sender)
    (current-index (default-to u0 (map-get? last-index {agent-id: agent-id, client: caller})))
    (next-index (+ current-index u1))
    (auth-check (contract-call? .identity-registry is-authorized-or-owner caller agent-id))
    (current-global-index (default-to u0 (map-get? last-global-index {agent-id: agent-id})))
    (next-global-index (+ current-global-index u1))
  )
    ;; Verify valueDecimals is valid (0-18)
    (asserts! (<= value-decimals u18) ERR_INVALID_DECIMALS)
    ;; Verify agent exists (is-authorized-or-owner returns error if not)
    (asserts! (is-ok auth-check) ERR_AGENT_NOT_FOUND)
    ;; Verify caller is NOT authorized (prevent self-feedback)
    (asserts! (not (unwrap-panic auth-check)) ERR_SELF_FEEDBACK)
    ;; Verify expiry
    (asserts! (> expiry stacks-block-height) ERR_AUTH_EXPIRED)
    ;; Verify index limit
    (asserts! (>= index-limit next-index) ERR_INDEX_LIMIT_EXCEEDED)
    ;; Verify signer is authorized (owner or operator)
    (asserts! (is-authorized agent-id signer) ERR_NOT_AUTHORIZED)
    ;; Verify SIP-018 signature
    (asserts! (verify-sip018-auth agent-id caller index-limit expiry signer signature) ERR_SIGNATURE_INVALID)
    ;; Compute and store WAD value for revocation
    (let ((wad-val (normalize-to-wad value value-decimals)))
      (map-set feedback
        {agent-id: agent-id, client: caller, index: next-index}
        {value: value, value-decimals: value-decimals, wad-value: wad-val, tag1: tag1, tag2: tag2, is-revoked: false}
      )
      ;; Update running totals
      (let (
        (current-summary (default-to {count: u0, wad-sum: 0} (map-get? agent-summary {agent-id: agent-id})))
      )
        (map-set agent-summary {agent-id: agent-id}
          {count: (+ (get count current-summary) u1), wad-sum: (+ (get wad-sum current-summary) wad-val)}
        )
      )
    )
    ;; Update last index
    (map-set last-index {agent-id: agent-id, client: caller} next-index)
    ;; Update global sequence
    (map-set global-feedback-index {agent-id: agent-id, global-index: next-global-index} {client: caller, client-index: next-index})
    (map-set last-global-index {agent-id: agent-id} next-global-index)
    ;; Track client if new
    (if (not (default-to false (map-get? client-exists {agent-id: agent-id, client: caller})))
      (let (
        (current-count (default-to u0 (map-get? client-count {agent-id: agent-id})))
        (next-count (+ current-count u1))
      )
        (map-set client-exists {agent-id: agent-id, client: caller} true)
        (map-set client-count {agent-id: agent-id} next-count)
        (map-set client-at-index {agent-id: agent-id, index: next-count} caller)
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
    (caller tx-sender)
    (fb (unwrap! (map-get? feedback {agent-id: agent-id, client: caller, index: index}) ERR_FEEDBACK_NOT_FOUND))
  )
    ;; Verify index is valid (> 0)
    (asserts! (> index u0) ERR_INVALID_INDEX)
    ;; Verify not already revoked
    (asserts! (not (get is-revoked fb)) ERR_ALREADY_REVOKED)
    ;; Update running totals (decrement count, subtract wad-value)
    (let (
      (current-summary (default-to {count: u0, wad-sum: 0} (map-get? agent-summary {agent-id: agent-id})))
      (wad-val (get wad-value fb))
    )
      (map-set agent-summary {agent-id: agent-id}
        {count: (- (get count current-summary) u1), wad-sum: (- (get wad-sum current-summary) wad-val)}
      )
    )
    ;; Mark as revoked
    (map-set feedback
      {agent-id: agent-id, client: caller, index: index}
      (merge fb {is-revoked: true})
    )
    ;; Emit event (enriched with value/decimals for indexer)
    (print {
      notification: "reputation-registry/FeedbackRevoked",
      payload: {
        agent-id: agent-id,
        client: caller,
        index: index,
        value: (get value fb),
        value-decimals: (get value-decimals fb)
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
    (responder tx-sender)
    (client-last-idx (default-to u0 (map-get? last-index {agent-id: agent-id, client: client})))
  )
    ;; Verify index is valid
    (asserts! (> index u0) ERR_INVALID_INDEX)
    (asserts! (<= index client-last-idx) ERR_FEEDBACK_NOT_FOUND)
    ;; Verify URI is not empty
    (asserts! (> (len response-uri) u0) ERR_EMPTY_URI)
    ;; Track responder if new
    (if (not (default-to false (map-get? responder-exists {agent-id: agent-id, client: client, index: index, responder: responder})))
      (let (
        (current-count (default-to u0 (map-get? responder-count {agent-id: agent-id, client: client, index: index})))
        (next-count (+ current-count u1))
      )
        (map-set responder-exists {agent-id: agent-id, client: client, index: index, responder: responder} true)
        (map-set responder-count {agent-id: agent-id, client: client, index: index} next-count)
        (map-set responder-at-index {agent-id: agent-id, client: client, index: index, responder-index: next-count} responder)
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

(define-read-only (get-summary (agent-id uint))
  (let (
    (summary (default-to {count: u0, wad-sum: 0} (map-get? agent-summary {agent-id: agent-id})))
  )
    (if (is-eq (get count summary) u0)
      {count: u0, summary-value: 0, summary-value-decimals: u18}
      (let (
        (avg-wad (/ (get wad-sum summary) (to-int (get count summary))))
      )
        {
          count: (get count summary),
          summary-value: avg-wad,
          summary-value-decimals: u18
        }
      )
    )
  )
)

(define-read-only (get-last-index (agent-id uint) (client principal))
  (default-to u0 (map-get? last-index {agent-id: agent-id, client: client}))
)

(define-read-only (get-agent-feedback-count (agent-id uint))
  (default-to u0 (map-get? last-global-index {agent-id: agent-id}))
)

(define-read-only (get-clients (agent-id uint) (opt-cursor (optional uint)))
  (let (
    (total-count (default-to u0 (map-get? client-count {agent-id: agent-id})))
    (cursor-offset (default-to u0 opt-cursor))
    (page-end (+ cursor-offset PAGE_SIZE))
    (has-more (> total-count page-end))
    (result (fold build-client-list-fold
      PAGE_INDEX_LIST
      {agent-id: agent-id, cursor-offset: cursor-offset, total-count: total-count, clients: (list)}
    ))
  )
    {
      clients: (get clients result),
      cursor: (if has-more (some page-end) none)
    }
  )
)

;; Legacy single response count (kept for backwards compatibility)
(define-read-only (get-response-count-single (agent-id uint) (client principal) (index uint) (responder principal))
  (default-to u0 (map-get? response-count {agent-id: agent-id, client: client, index: index, responder: responder}))
)

;; Flexible response count with optional filters and cursor pagination
(define-read-only (get-response-count
  (agent-id uint)
  (opt-client (optional principal))
  (opt-feedback-index (optional uint))
  (opt-responders (optional (list 200 principal)))
  (opt-cursor (optional uint))
)
  (let ((cursor-offset (default-to u0 opt-cursor)))
    (match opt-client
      ;; Client specified: count for that client
      client-val
        (let (
          (last-idx (get-last-index agent-id client-val))
          (page-end (+ cursor-offset PAGE_SIZE))
          (client-has-more (> last-idx page-end))
        )
          (match opt-feedback-index
            ;; Specific feedback index
            idx-val
              (if (or (is-eq idx-val u0) (> idx-val last-idx))
                ;; Index 0 or invalid: count all feedback for this client (paginated)
                {total: (get total (fold count-all-feedback-fold
                  PAGE_INDEX_LIST
                  {agent-id: agent-id, client: client-val, last-idx: last-idx, responders: opt-responders, total: u0, current-idx: u0, cursor-offset: cursor-offset})),
                 cursor: (if client-has-more (some page-end) none)}
                ;; Specific index: no pagination needed
                {total: (match opt-responders
                  responder-list (get total (fold count-responder-fold responder-list {agent-id: agent-id, client: client-val, index: idx-val, total: u0}))
                  (get total (fold count-all-responders-fold
                    (get responders (get-responders agent-id client-val idx-val none))
                    {agent-id: agent-id, client: client-val, index: idx-val, total: u0}))
                ), cursor: none}
              )
            ;; No index: count all feedback for this client (paginated)
            {total: (get total (fold count-all-feedback-fold
              PAGE_INDEX_LIST
              {agent-id: agent-id, client: client-val, last-idx: last-idx, responders: opt-responders, total: u0, current-idx: u0, cursor-offset: cursor-offset})),
             cursor: (if client-has-more (some page-end) none)}
          )
        )
      ;; No client: count across all clients (paginated)
      (let (
        (client-list (get clients (get-clients agent-id none)))
        (result (fold count-all-clients-fold
          client-list
          {agent-id: agent-id, opt-feedback-index: opt-feedback-index, opt-responders: opt-responders, total: u0, cursor-offset: cursor-offset, has-more: false}))
      )
        {total: (get total result), cursor: (if (get has-more result) (some (+ cursor-offset PAGE_SIZE)) none)}
      )
    )
  )
)

(define-read-only (get-approved-limit (agent-id uint) (client principal))
  (default-to u0 (map-get? approved-clients {agent-id: agent-id, client: client}))
)

(define-read-only (read-all-feedback
  (agent-id uint)
  (opt-tag1 (optional (string-utf8 64)))
  (opt-tag2 (optional (string-utf8 64)))
  (include-revoked bool)
  (opt-cursor (optional uint))
)
  (let (
    (last-global (default-to u0 (map-get? last-global-index {agent-id: agent-id})))
    (cursor-offset (default-to u0 opt-cursor))
    (page-end (+ cursor-offset PAGE_SIZE))
    (has-more (> last-global page-end))
    (result (fold read-all-global-fold
      PAGE_INDEX_LIST
      {
        agent-id: agent-id,
        tag1: opt-tag1,
        tag2: opt-tag2,
        include-revoked: include-revoked,
        items: (list),
        cursor-offset: cursor-offset,
        last-global: last-global
      }
    ))
  )
    {
      items: (get items result),
      cursor: (if has-more (some page-end) none)
    }
  )
)

(define-read-only (get-responders (agent-id uint) (client principal) (index uint) (opt-cursor (optional uint)))
  (let (
    (total-count (default-to u0 (map-get? responder-count {agent-id: agent-id, client: client, index: index})))
    (cursor-offset (default-to u0 opt-cursor))
    (page-end (+ cursor-offset PAGE_SIZE))
    (has-more (> total-count page-end))
    (result (fold build-responder-list-fold
      PAGE_INDEX_LIST
      {agent-id: agent-id, client: client, index: index, cursor-offset: cursor-offset, total-count: total-count, responders: (list)}
    ))
  )
    {
      responders: (get responders result),
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

(define-private (read-all-global-fold
  (idx uint)
  (acc {
    agent-id: uint,
    tag1: (optional (string-utf8 64)),
    tag2: (optional (string-utf8 64)),
    include-revoked: bool,
    items: (list 14 {client: principal, index: uint, value: int, value-decimals: uint, wad-value: int, tag1: (string-utf8 64), tag2: (string-utf8 64), is-revoked: bool}),
    cursor-offset: uint,
    last-global: uint
  })
)
  (let ((global-idx (+ idx (get cursor-offset acc))))
    (if (or (> global-idx (get last-global acc)) (>= (len (get items acc)) u14))
      acc
      (let (
        (pointer-opt (map-get? global-feedback-index {agent-id: (get agent-id acc), global-index: global-idx}))
      )
        (match pointer-opt pointer
          (let (
            (fb-opt (map-get? feedback {
              agent-id: (get agent-id acc),
              client: (get client pointer),
              index: (get client-index pointer)
            }))
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
                    client: (get client pointer),
                    index: (get client-index pointer),
                    value: (get value fb),
                    value-decimals: (get value-decimals fb),
                    wad-value: (get wad-value fb),
                    tag1: (get tag1 fb),
                    tag2: (get tag2 fb),
                    is-revoked: (get is-revoked fb)
                  }) u14)
                    new-items (merge acc {items: new-items})
                    acc
                  )
                  acc
                )
              )
              acc
            )
          )
          acc
        )
      )
    )
  )
)

;; Response count fold helpers

(define-private (count-all-clients-fold
  (client principal)
  (acc {agent-id: uint, opt-feedback-index: (optional uint), opt-responders: (optional (list 200 principal)), total: uint, cursor-offset: uint, has-more: bool})
)
  (let (
    (agent-id (get agent-id acc))
    (last-idx (get-last-index agent-id client))
    (page-end (+ (get cursor-offset acc) PAGE_SIZE))
    (client-has-more (> last-idx page-end))
  )
    (match (get opt-feedback-index acc)
      ;; Specific feedback index
      idx-val
        (if (or (is-eq idx-val u0) (> idx-val last-idx))
          ;; Index 0 or invalid: count all feedback for this client (paginated)
          (merge acc {total: (+ (get total acc)
            (get total (fold count-all-feedback-fold
              PAGE_INDEX_LIST
              {agent-id: agent-id, client: client, last-idx: last-idx, responders: (get opt-responders acc), total: u0, current-idx: u0, cursor-offset: (get cursor-offset acc)}))),
            has-more: (or (get has-more acc) client-has-more)})
          ;; Specific index: count for that feedback (no pagination)
          (merge acc {total: (+ (get total acc)
            (match (get opt-responders acc)
              responder-list (get total (fold count-responder-fold responder-list {agent-id: agent-id, client: client, index: idx-val, total: u0}))
              (get total (fold count-all-responders-fold
                (get responders (get-responders agent-id client idx-val none))
                {agent-id: agent-id, client: client, index: idx-val, total: u0}))
            ))})
        )
      ;; No index: count all feedback for this client (paginated)
      (merge acc {total: (+ (get total acc)
        (get total (fold count-all-feedback-fold
          PAGE_INDEX_LIST
          {agent-id: agent-id, client: client, last-idx: last-idx, responders: (get opt-responders acc), total: u0, current-idx: u0, cursor-offset: (get cursor-offset acc)}))),
        has-more: (or (get has-more acc) client-has-more)})
    )
  )
)

(define-private (count-all-feedback-fold
  (idx uint)
  (acc {agent-id: uint, client: principal, last-idx: uint, responders: (optional (list 200 principal)), total: uint, current-idx: uint, cursor-offset: uint})
)
  (let ((actual-idx (+ idx (get cursor-offset acc))))
    (if (> actual-idx (get last-idx acc))
      acc
      (let (
        (responders-for-idx (get responders (get-responders (get agent-id acc) (get client acc) actual-idx none)))
      )
        (merge acc {total: (+ (get total acc)
          (match (get responders acc)
            responder-list (get total (fold count-responder-fold responder-list {agent-id: (get agent-id acc), client: (get client acc), index: actual-idx, total: u0}))
            (get total (fold count-all-responders-fold responders-for-idx {agent-id: (get agent-id acc), client: (get client acc), index: actual-idx, total: u0}))
          ))})
      )
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

;; Helper for building paginated client lists
(define-private (build-client-list-fold
  (idx uint)
  (acc {agent-id: uint, cursor-offset: uint, total-count: uint, clients: (list 14 principal)})
)
  (let ((actual-idx (+ idx (get cursor-offset acc))))
    (if (> actual-idx (get total-count acc))
      acc
      (let (
        (client-opt (map-get? client-at-index {agent-id: (get agent-id acc), index: actual-idx}))
      )
        (match client-opt client
          (match (as-max-len? (append (get clients acc) client) u14)
            new-clients (merge acc {clients: new-clients})
            acc
          )
          acc
        )
      )
    )
  )
)

;; Helper for building paginated responder lists
(define-private (build-responder-list-fold
  (idx uint)
  (acc {agent-id: uint, client: principal, index: uint, cursor-offset: uint, total-count: uint, responders: (list 14 principal)})
)
  (let ((actual-idx (+ idx (get cursor-offset acc))))
    (if (> actual-idx (get total-count acc))
      acc
      (let (
        (responder-opt (map-get? responder-at-index {
          agent-id: (get agent-id acc),
          client: (get client acc),
          index: (get index acc),
          responder-index: actual-idx
        }))
      )
        (match responder-opt responder
          (match (as-max-len? (append (get responders acc) responder) u14)
            new-responders (merge acc {responders: new-responders})
            acc
          )
          acc
        )
      )
    )
  )
)
;;
