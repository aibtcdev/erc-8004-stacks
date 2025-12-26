;; title: base-registry
;; version: 1.0.0
;; summary: A secure, modular foundation for mapping human owners to autonomous AI agents.

;; traits
;;

;; token definitions
;;

;; constants
(define-constant ERR_ALREADY_REGISTERED (err u100))
(define-constant ERR_NOT_OWNER (err u101))
(define-constant ERR_INVALID_OWNER_TYPE (err u102))
(define-constant ERR_INVALID_AGENT_TYPE (err u103))
(define-constant ERR_AGENT_NOT_FOUND (err u104))

;; data vars
;;

;; data maps
;;

(define-map OwnerToAgent principal principal)
(define-map AgentToOwner principal principal)

(define-map AgentDetails
  principal ;; agent address
  {
    owner: principal, ;; owner address
    name: (string-utf8 256),
    description: (string-utf8 256)
  }
)

;; public functions
(define-public (register-agent (agent principal) (name (string-utf8 256)) (description (string-utf8 256)))
  (let (
        (owner tx-sender)
        (id (compute-agent-id owner agent name description)))
    (try! (validate-owner-agent owner agent))
    (asserts! (is-none (map-get? OwnerToAgent owner)) ERR_ALREADY_REGISTERED)
    (asserts! (is-none (map-get? AgentDetails agent)) ERR_ALREADY_REGISTERED)
    (map-set AgentDetails agent {owner: owner, name: name, description: description})
    (map-set OwnerToAgent owner agent)
    (map-set AgentToOwner agent owner)
    (print { event: "agent-registered", owner: owner, agent: agent, id: id })
    (ok id)))

(define-public (deregister-agent (agent principal))
  (let (
        (details (unwrap! (map-get? AgentDetails agent) ERR_AGENT_NOT_FOUND))
        (owner (get owner details)))
    (asserts! (is-eq owner tx-sender) ERR_NOT_OWNER)
    (map-delete AgentDetails agent)
    (map-delete OwnerToAgent owner)
    (map-delete AgentToOwner agent)
    (print { event: "agent-deregistered", owner: owner, agent: agent })
    (ok true)))

;; read only functions
(define-read-only (get-agent-by-owner (owner principal))
  (map-get? OwnerToAgent owner))

(define-read-only (get-owner-by-agent (agent principal))
  (map-get? AgentToOwner agent))

(define-read-only (get-agent-details (agent principal))
  (map-get? AgentDetails agent))

(define-read-only (get-agent-info (agent principal))
  (match (map-get? AgentDetails agent)
    details (let (
          (owner (get owner details))
          (name (get name details))
          (description (get description details)))
      (some {
        owner: owner,
        agent: agent,
        name: name,
        description: description,
        id: (compute-agent-id owner agent name description)
      }))
    none))

(define-constant ERR_DESTRUCTING (err u1234))

;; private functions
(define-private (is-bare-principal (p principal))
  (is-none (get name (unwrap! (principal-destruct? p) false))))

(define-private (is-contract-principal (p principal))
  (is-some (get name (unwrap! (principal-destruct? p) false))))

(define-private (validate-owner-agent (owner principal) (agent principal))
  (begin
    (asserts! (is-bare-principal owner) ERR_INVALID_OWNER_TYPE)
    (asserts! (is-contract-principal agent) ERR_INVALID_AGENT_TYPE)
    (ok true)))

(define-constant ERR_HASHING (err u1234))

(define-private (compute-agent-id (owner principal) (agent principal) (name (string-utf8 256)) (description (string-utf8 256)))
  (let (
    (agentRecord (to-consensus-buff? {
      owner: owner,
      agent: agent,
      name: name,
      description: description
    }))
  )
  ;; verify conversion worked
  (asserts! (is-some agentRecord) ERR_HASHING)
  ;; extract and return the hash
  (ok (sha256 (unwrap-panic agentRecord)))
))
