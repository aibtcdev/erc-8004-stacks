;; title: bitcoin-agents
;; version: 1.0.0
;; summary: Tamagotchi-style AI agents on Bitcoin - lifecycle management with hunger, health, XP, and evolution.
;; description: Agents need feeding to stay alive. They gain XP, evolve through tiers, and permanently die if neglected.
;;              Integrates with ERC-8004 identity-registry for agent registration.

;; ============================================
;; CONSTANTS
;; ============================================

;; Error codes (u4000+ range for bitcoin-agents)
(define-constant ERR_NOT_AUTHORIZED (err u4000))
(define-constant ERR_AGENT_NOT_FOUND (err u4001))
(define-constant ERR_AGENT_ALREADY_DEAD (err u4002))
(define-constant ERR_INSUFFICIENT_PAYMENT (err u4003))
(define-constant ERR_INVALID_FOOD_TIER (err u4004))
(define-constant ERR_AGENT_NOT_DEAD (err u4005))
(define-constant ERR_EPITAPH_ALREADY_SET (err u4006))
(define-constant ERR_NAME_TOO_LONG (err u4007))
(define-constant ERR_MINT_FAILED (err u4008))
(define-constant ERR_NAME_TOO_SHORT (err u4009))
(define-constant ERR_XP_OVERFLOW (err u4010))
(define-constant ERR_EPITAPH_TOO_SHORT (err u4011))

;; Contract references
(define-constant SBTC_CONTRACT 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.token-sbtc)

;; Pricing (in sats/microSTX for sBTC)
(define-constant MINT_COST u10000)           ;; 10,000 sats to mint
(define-constant FOOD_BASIC_COST u100)       ;; 100 sats - basic food
(define-constant FOOD_PREMIUM_COST u500)     ;; 500 sats - premium food
(define-constant FOOD_GOURMET_COST u1000)    ;; 1,000 sats - gourmet food

;; Hunger/Health mechanics
(define-constant MAX_HUNGER u100)
(define-constant MAX_HEALTH u100)
(define-constant BLOCKS_PER_DAY u144)        ;; ~10 min blocks, 144/day
(define-constant HUNGER_DECAY_PER_DAY u10)   ;; Lose 10 hunger per day
(define-constant HEALTH_DECAY_RATE u5)       ;; Lose 5 health per day when starving

;; XP rewards
(define-constant XP_FEED_BASIC u10)
(define-constant XP_FEED_PREMIUM u25)
(define-constant XP_FEED_GOURMET u50)
(define-constant XP_ACTION_SMALL u25)
(define-constant XP_ACTION_MEDIUM u50)
(define-constant XP_ACTION_LARGE u100)
(define-constant XP_INTERACTION u15)

;; Evolution thresholds
(define-constant LEVEL_HATCHLING u0)         ;; 0 XP
(define-constant LEVEL_JUNIOR u1)            ;; 500 XP
(define-constant LEVEL_SENIOR u2)            ;; 2,000 XP
(define-constant LEVEL_ELDER u3)             ;; 10,000 XP
(define-constant LEVEL_LEGENDARY u4)         ;; 50,000 XP

(define-constant XP_JUNIOR u500)
(define-constant XP_SENIOR u2000)
(define-constant XP_ELDER u10000)
(define-constant XP_LEGENDARY u50000)
(define-constant MAX_XP u1000000)            ;; 1M XP cap to prevent overflow

;; Food tiers
(define-constant FOOD_TIER_BASIC u1)
(define-constant FOOD_TIER_PREMIUM u2)
(define-constant FOOD_TIER_GOURMET u3)

(define-constant VERSION u"1.0.0")

;; ============================================
;; DATA VARIABLES
;; ============================================

(define-data-var next-agent-id uint u0)
(define-data-var total-deaths uint u0)
(define-data-var total-feedings uint u0)

;; ============================================
;; DATA MAPS
;; ============================================

;; Core agent data
(define-map agents uint {
  owner: principal,
  name: (string-utf8 64),
  hunger: uint,           ;; 0-100, computed value at last-fed
  health: uint,           ;; 0-100, computed value at last-fed
  xp: uint,
  birth-block: uint,
  last-fed: uint,         ;; Block height when last fed
  total-fed-count: uint,
  alive: bool
})

;; Death certificates for fallen agents
(define-map death-certificates uint {
  name: (string-utf8 64),
  owner: principal,
  birth-block: uint,
  death-block: uint,
  cause: (string-utf8 32),
  final-level: uint,
  total-xp: uint,
  total-fed: uint,
  epitaph: (string-utf8 256)
})

;; ERC-8004 identity mapping (agent-id -> identity-id)
(define-map agent-identities uint uint)

;; ============================================
;; PUBLIC FUNCTIONS
;; ============================================

;; Mint a new agent
(define-public (mint-agent (name (string-utf8 64)))
  (let (
    (agent-id (var-get next-agent-id))
    (owner tx-sender)
  )
    ;; Validate name length (1-64 characters)
    (asserts! (>= (len name) u1) ERR_NAME_TOO_SHORT)
    (asserts! (<= (len name) u64) ERR_NAME_TOO_LONG)

    ;; Transfer sBTC payment
    ;; Note: In production, uncomment this:
    ;; (try! (contract-call? SBTC_CONTRACT transfer MINT_COST tx-sender (as-contract tx-sender) none))

    ;; Create agent
    (map-set agents agent-id {
      owner: owner,
      name: name,
      hunger: MAX_HUNGER,
      health: MAX_HEALTH,
      xp: u0,
      birth-block: stacks-block-height,
      last-fed: stacks-block-height,
      total-fed-count: u0,
      alive: true
    })

    ;; Register with ERC-8004 identity registry
    ;; Note: In production, uncomment this:
    ;; (let ((identity-id (try! (contract-call? .identity-registry register-with-uri
    ;;   (concat u"https://aibtc.com/agents/" (uint-to-string agent-id))))))
    ;;   (map-set agent-identities agent-id identity-id))

    ;; Increment counter
    (var-set next-agent-id (+ agent-id u1))

    ;; Emit event
    (print {
      notification: "bitcoin-agents/AgentMinted",
      payload: {
        agent-id: agent-id,
        owner: owner,
        name: name,
        birth-block: stacks-block-height
      }
    })

    (ok agent-id)
  )
)

;; Feed an agent to restore hunger
(define-public (feed-agent (agent-id uint) (food-tier uint))
  (let (
    (agent (unwrap! (map-get? agents agent-id) ERR_AGENT_NOT_FOUND))
    (current-state (get-computed-state agent-id))
  )
    ;; Must be alive
    (asserts! (get alive agent) ERR_AGENT_ALREADY_DEAD)

    ;; Check if actually dead (computed health = 0)
    (asserts! (> (get health current-state) u0) ERR_AGENT_ALREADY_DEAD)

    ;; Must be owner
    (asserts! (is-eq tx-sender (get owner agent)) ERR_NOT_AUTHORIZED)

    ;; Validate food tier and get cost/xp
    (let (
      (food-data (try! (get-food-data food-tier)))
      (cost (get cost food-data))
      (xp-reward (get xp food-data))
      (new-xp (+ (get xp agent) xp-reward))
    )
      ;; Check XP overflow
      (asserts! (<= new-xp MAX_XP) ERR_XP_OVERFLOW)

      ;; Transfer sBTC payment
      ;; Note: In production, uncomment this:
      ;; (try! (contract-call? SBTC_CONTRACT transfer cost tx-sender (as-contract tx-sender) none))

      ;; Update agent state
      (map-set agents agent-id (merge agent {
        hunger: MAX_HUNGER,
        health: (get health current-state),  ;; Preserve current computed health
        xp: new-xp,
        last-fed: stacks-block-height,
        total-fed-count: (+ (get total-fed-count agent) u1)
      }))

      ;; Update global stats
      (var-set total-feedings (+ (var-get total-feedings) u1))

      ;; Check for level up
      (let (
        (old-level (get-level-from-xp (get xp agent)))
        (new-level (get-level-from-xp new-xp))
      )
        (if (> new-level old-level)
          (begin
            (print {
              notification: "bitcoin-agents/LevelUp",
              payload: {
                agent-id: agent-id,
                old-level: old-level,
                new-level: new-level,
                total-xp: new-xp
              }
            })
            true
          )
          true
        )
      )

      ;; Emit feed event
      (print {
        notification: "bitcoin-agents/AgentFed",
        payload: {
          agent-id: agent-id,
          food-tier: food-tier,
          xp-gained: xp-reward,
          feeder: tx-sender
        }
      })

      (ok true)
    )
  )
)

;; Add XP to an agent (for external actions)
(define-public (add-xp (agent-id uint) (amount uint))
  (let (
    (agent (unwrap! (map-get? agents agent-id) ERR_AGENT_NOT_FOUND))
    (new-xp (+ (get xp agent) amount))
  )
    ;; Must be alive
    (asserts! (get alive agent) ERR_AGENT_ALREADY_DEAD)

    ;; Only owner can add XP (or could be extended for authorized callers)
    (asserts! (is-eq tx-sender (get owner agent)) ERR_NOT_AUTHORIZED)

    ;; Check XP overflow
    (asserts! (<= new-xp MAX_XP) ERR_XP_OVERFLOW)

    ;; Update XP
    (map-set agents agent-id (merge agent {
      xp: new-xp
    }))

    ;; Check for level up
    (let (
      (old-level (get-level-from-xp (get xp agent)))
      (new-level (get-level-from-xp new-xp))
    )
      (if (> new-level old-level)
        (begin
          (print {
            notification: "bitcoin-agents/LevelUp",
            payload: {
              agent-id: agent-id,
              old-level: old-level,
              new-level: new-level,
              total-xp: new-xp
            }
          })
          true
        )
        true
      )
    )

    (ok true)
  )
)

;; Check and process death - anyone can call
(define-public (check-death (agent-id uint))
  (let (
    (agent (unwrap! (map-get? agents agent-id) ERR_AGENT_NOT_FOUND))
    (current-state (get-computed-state agent-id))
  )
    ;; Must still be marked alive
    (asserts! (get alive agent) ERR_AGENT_ALREADY_DEAD)

    ;; Check if actually dead
    (if (<= (get health current-state) u0)
      (begin
        ;; Mark as dead
        (map-set agents agent-id (merge agent {
          alive: false,
          hunger: u0,
          health: u0
        }))

        ;; Create death certificate
        (map-set death-certificates agent-id {
          name: (get name agent),
          owner: (get owner agent),
          birth-block: (get birth-block agent),
          death-block: stacks-block-height,
          cause: u"starvation",
          final-level: (get-level-from-xp (get xp agent)),
          total-xp: (get xp agent),
          total-fed: (get total-fed-count agent),
          epitaph: u""
        })

        ;; Update global stats
        (var-set total-deaths (+ (var-get total-deaths) u1))

        ;; Emit death event
        (print {
          notification: "bitcoin-agents/AgentDied",
          payload: {
            agent-id: agent-id,
            name: (get name agent),
            owner: (get owner agent),
            cause: u"starvation",
            lifespan-blocks: (- stacks-block-height (get birth-block agent)),
            final-level: (get-level-from-xp (get xp agent)),
            total-xp: (get xp agent)
          }
        })

        (ok true)
      )
      ;; Agent is still alive
      (ok false)
    )
  )
)

;; Write epitaph for dead agent (owner only, one-time)
(define-public (write-epitaph (agent-id uint) (epitaph (string-utf8 256)))
  (let (
    (agent (unwrap! (map-get? agents agent-id) ERR_AGENT_NOT_FOUND))
    (cert (unwrap! (map-get? death-certificates agent-id) ERR_AGENT_NOT_DEAD))
  )
    ;; Must be owner
    (asserts! (is-eq tx-sender (get owner agent)) ERR_NOT_AUTHORIZED)

    ;; Epitaph must have content (at least 1 character)
    (asserts! (>= (len epitaph) u1) ERR_EPITAPH_TOO_SHORT)

    ;; Epitaph not already set
    (asserts! (is-eq (get epitaph cert) u"") ERR_EPITAPH_ALREADY_SET)

    ;; Update death certificate
    (map-set death-certificates agent-id (merge cert {
      epitaph: epitaph
    }))

    (print {
      notification: "bitcoin-agents/EpitaphWritten",
      payload: {
        agent-id: agent-id,
        epitaph: epitaph
      }
    })

    (ok true)
  )
)

;; ============================================
;; READ-ONLY FUNCTIONS
;; ============================================

;; Get agent data
(define-read-only (get-agent (agent-id uint))
  (map-get? agents agent-id)
)

;; Get death certificate
(define-read-only (get-death-certificate (agent-id uint))
  (map-get? death-certificates agent-id)
)

;; Get computed current state (hunger/health with decay applied)
(define-read-only (get-computed-state (agent-id uint))
  (let (
    (agent (unwrap! (map-get? agents agent-id) {hunger: u0, health: u0, alive: false}))
  )
    (if (not (get alive agent))
      ;; Already dead
      {hunger: u0, health: u0, alive: false}
      ;; Calculate decay
      (let (
        (blocks-elapsed (- stacks-block-height (get last-fed agent)))
        (hunger-decay (/ (* blocks-elapsed HUNGER_DECAY_PER_DAY) BLOCKS_PER_DAY))
        (raw-hunger (if (> (get hunger agent) hunger-decay)
                       (- (get hunger agent) hunger-decay)
                       u0))
        ;; Health only decays when hunger is 0
        (starving-blocks (if (> hunger-decay (get hunger agent))
                            (- hunger-decay (get hunger agent))
                            u0))
        (health-decay (/ (* starving-blocks HEALTH_DECAY_RATE) HUNGER_DECAY_PER_DAY))
        (raw-health (if (> (get health agent) health-decay)
                       (- (get health agent) health-decay)
                       u0))
      )
        {
          hunger: raw-hunger,
          health: raw-health,
          alive: (> raw-health u0)
        }
      )
    )
  )
)

;; Get level from XP
(define-read-only (get-level-from-xp (xp uint))
  (if (>= xp XP_LEGENDARY)
    LEVEL_LEGENDARY
    (if (>= xp XP_ELDER)
      LEVEL_ELDER
      (if (>= xp XP_SENIOR)
        LEVEL_SENIOR
        (if (>= xp XP_JUNIOR)
          LEVEL_JUNIOR
          LEVEL_HATCHLING
        )
      )
    )
  )
)

;; Get level name
(define-read-only (get-level-name (level uint))
  (if (is-eq level LEVEL_LEGENDARY)
    u"Legendary"
    (if (is-eq level LEVEL_ELDER)
      u"Elder"
      (if (is-eq level LEVEL_SENIOR)
        u"Senior"
        (if (is-eq level LEVEL_JUNIOR)
          u"Junior"
          u"Hatchling"
        )
      )
    )
  )
)

;; Get agent's current level
(define-read-only (get-agent-level (agent-id uint))
  (let (
    (agent (unwrap! (map-get? agents agent-id) u0))
  )
    (get-level-from-xp (get xp agent))
  )
)

;; Get XP needed for next level
(define-read-only (get-xp-to-next-level (agent-id uint))
  (match (map-get? agents agent-id)
    agent
    (let (
      (current-xp (get xp agent))
      (current-level (get-level-from-xp current-xp))
    )
      (if (is-eq current-level LEVEL_LEGENDARY)
        u0  ;; Already max level
        (if (is-eq current-level LEVEL_ELDER)
          (- XP_LEGENDARY current-xp)
          (if (is-eq current-level LEVEL_SENIOR)
            (- XP_ELDER current-xp)
            (if (is-eq current-level LEVEL_JUNIOR)
              (- XP_SENIOR current-xp)
              (- XP_JUNIOR current-xp)
            )
          )
        )
      )
    )
    u0  ;; Agent not found
  )
)

;; Get food tier data
(define-read-only (get-food-data (food-tier uint))
  (if (is-eq food-tier FOOD_TIER_BASIC)
    (ok {cost: FOOD_BASIC_COST, xp: XP_FEED_BASIC, name: u"Basic"})
    (if (is-eq food-tier FOOD_TIER_PREMIUM)
      (ok {cost: FOOD_PREMIUM_COST, xp: XP_FEED_PREMIUM, name: u"Premium"})
      (if (is-eq food-tier FOOD_TIER_GOURMET)
        (ok {cost: FOOD_GOURMET_COST, xp: XP_FEED_GOURMET, name: u"Gourmet"})
        ERR_INVALID_FOOD_TIER
      )
    )
  )
)

;; Get global stats
(define-read-only (get-stats)
  {
    total-agents: (var-get next-agent-id),
    total-deaths: (var-get total-deaths),
    total-feedings: (var-get total-feedings),
    alive-count: (- (var-get next-agent-id) (var-get total-deaths))
  }
)

;; Get ERC-8004 identity for agent
(define-read-only (get-agent-identity (agent-id uint))
  (map-get? agent-identities agent-id)
)

;; Get version
(define-read-only (get-version)
  VERSION
)

;; Check if agent can perform action based on level
(define-read-only (can-perform-action (agent-id uint) (required-level uint))
  (let (
    (current-level (get-agent-level agent-id))
  )
    (>= current-level required-level)
  )
)
