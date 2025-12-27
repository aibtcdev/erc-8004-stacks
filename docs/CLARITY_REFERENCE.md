# Clarity Reference

Compact guide for Clarity contract development. Use for generating secure, decidable smart contracts on Stacks.

## Principles

- **Decidable**: Predictable execution; no unbounded loops/recursion; static cost analysis; no gas exhaustion.
- **Interpreted**: Source committed as-is; human-readable; no compiler bugs.
- **Secure**: No reentrancy; overflow/underflow aborts tx; responses must be checked; post-conditions protect assets.
- **Bitcoin-native**: Read Bitcoin state; secp256k1/256r1 sigs; PoX stacking.
- **Tokens built-in**: FT/NFT/STX primitives; no manual balances.
- **Composition**: Traits over inheritance.
- **Public fns**: Must return `(response ok-type err-type)`; `ok` commits, `err` reverts.
- **Clarity 4**: On-chain contract verification, asset restrictions, timestamps, passkeys.

## Types

| Type                    | Description                                     |
| ----------------------- | ----------------------------------------------- |
| `int`                   | Signed 128-bit integer                          |
| `uint`                  | Unsigned 128-bit integer                        |
| `bool`                  | `true`/`false`                                  |
| `principal`             | Address (standard/contract)                     |
| `(buff len)`            | Byte buffer ≤ `len`                             |
| `(string-ascii len)`    | ASCII ≤ `len`                                   |
| `(string-utf8 len)`     | UTF-8 ≤ `len`                                   |
| `(list len T)`          | List ≤ `len` of type `T` (`sequence` meta-type) |
| `{label: T, ...}`       | Named tuple (`merge` for updates)               |
| `(optional T)`          | `(some T)` or `none`                            |
| `(response ok-T err-T)` | Public fn return: `ok`/`err`                    |

**Notes**: `sequence` meta-type (list/buff/str); `as-max-len? seq new-len` converts max-len (panics if exceeds).

## Keywords

| Keyword               | Type                   | Description/Example                                 |
| --------------------- | ---------------------- | --------------------------------------------------- |
| `block-height`        | `uint`                 | Legacy Stacks height (use `stacks-block-height`)    |
| `burn-block-height`   | `uint`                 | Bitcoin burn height                                 |
| `chain-id`            | `uint`                 | Network ID (1=mainnet)                              |
| `contract-caller`     | `principal`            | Caller principal                                    |
| `contract-hash?`      | `principal`            | `(response (buff 32) u)`: On-chain hash (Clarity 4) |
| `current-contract`    | `principal`            | This contract (Clarity 4)                           |
| `false`/`true`        | `bool`                 | Booleans                                            |
| `is-in-mainnet`       | `bool`                 | Mainnet?                                            |
| `is-in-regtest`       | `bool`                 | Regtest?                                            |
| `is-in-testnet`       | `bool`                 | Testnet?                                            |
| `none`                | `(optional ?)`         | None value                                          |
| `stacks-block-height` | `uint`                 | Stacks height (Clarity 3+)                          |
| `stacks-block-time`   | `uint`                 | Current block timestamp (Clarity 4)                 |
| `stx-liquid-supply`   | `uint`                 | Liquid uSTX                                         |
| `tenure-height`       | `uint`                 | Tenure count (Clarity 3+)                           |
| `tx-sender`           | `principal`            | Tx origin                                           |
| `tx-sponsor?`         | `(optional principal)` | Sponsor if any                                      |

## Contract Structure

### Definitions (top-level)

```
(define-constant NAME expr)
(define-data-var var-name T init-val)
(define-map map-name {key-T} value-T)
(define-fungible-token token-name [supply-cap])
(define-non-fungible-token nft-name id-T)
(define-private (fn (arg T)) body) ;; Internal
(define-public (fn (arg T)) (response ok err)) ;; Mutable, tx entry
(define-read-only (fn (arg T)) body) ;; Pure view
(define-trait trait-name ((fn1 (args) resp) ...))
(impl-trait .other-contract.trait-name)
```

#### Coding Standards

- Constants: `UPPER_CASE`.
- Vars/maps: `PascalCase`/`camelCase`.
- Fns: `kebab-case`.
- Tuples: `camelCase` keys, multi-line.
- Parentheses: Align complex `let`s.
- Errors: `(define-constant ERR_NAME (err uN))` (u1000+ ranges per contract).

### Traits

```
(use-trait alias .deployer.trait-name)
(fn (t <alias>) (contract-call? t fn args))
```

## Functions by Category

### Arithmetic

| Fn      | Args        | Returns  | Notes/Example                       |
| ------- | ----------- | -------- | ----------------------------------- |
| `+`     | ints/uints  | int/uint | `(+ 1 2 3)` → `6`                   |
| `-`     | ints/uints  | int/uint | `(- 5 2)` → `3`                     |
| `*`     | ints/uints  | int/uint | `(* 2 3)` → `6`                     |
| `/`     | ints/uints  | int/uint | `(/ 5 2)` → `2` (floors; panics /0) |
| `mod`   | ints/uints  | int/uint | `5 % 2` → `1`                       |
| `pow`   | base exp    | int/uint | `(pow 2 3)` → `8`                   |
| `sqrti` | int/uint ≥0 | int/uint | `(sqrti 9)` → `3`                   |
| `log2`  | int/uint >0 | int/uint | `(log2 8)` → `3`                    |

**Notes**: Fixed-point: `(* amount SCALE) / SCALE` (SCALE=`(pow u10 u8)`). [ccd012-redemption-nyc](https://github.com/citycoins/protocol/blob/main/contracts/extensions/ccd012-redemption-nyc.clar)

### Bitwise

| Fn                | Args           | Returns/Example                |
| ----------------- | -------------- | ------------------------------ |
| `bit-and`         | ints/uints     | `(bit-and 5 3)` → `1`          |
| `bit-or`          | ints/uints     | `(bit-or 1 2)` → `3`           |
| `bit-xor`         | ints/uints     | `(bit-xor 1 3)` → `2`          |
| `bit-not`         | int/uint       | `(bit-not 1)` → `-2`           |
| `bit-shift-left`  | int/uint, uint | `(bit-shift-left 1 u1)` → `2`  |
| `bit-shift-right` | int/uint, uint | `(bit-shift-right 4 u1)` → `2` |

### Comparisons

| Fn                | Types               | Example                |
| ----------------- | ------------------- | ---------------------- |
| `<` `<=` `>` `>=` | int/uint/str\*/buff | `(< 1 2)` → `true`     |
| `is-eq`           | any same            | `(is-eq 1 1)` → `true` |

### Logic

| Fn    | Args  | Example                |
| ----- | ----- | ---------------------- |
| `and` | bools | Short-circuits         |
| `or`  | bools | Short-circuits         |
| `not` | bool  | `(not true)` → `false` |

### Control Flow

```
(if pred then else) ;; Same type branches
(let ((x val) (y val)) body) ;; Scoped binds
(begin expr1 expr2 ... last) ;; Seq, returns last
(match opt some-val none-val)
(match resp {ok v ok-body} {err e err-body})
(try! resp-or-opt) ;; Unwrap or early return err/none
(unwrap! opt def) ;; Panic on none (known `some`)
(unwrap-panic! opt) ;; Panic on none (known `some` only)
(asserts! bool err-val) ;; Assert or early err
```

### Sequences (list/buff/str-ascii/utf8)

| Fn            | Args          | Returns/Example                                |
| ------------- | ------------- | ---------------------------------------------- |
| `list`        | Ts            | `(list 1 2 3)`                                 |
| `len`         | seq           | `(len (list 1 2))` → `u2`                      |
| `concat`      | seq seq       | `(concat "a" "b")` → `"ab"`                    |
| `append`      | list T        | `(append (list 1) 2)` (increases max-len)      |
| `element-at?` | seq uint      | `(some val)` or `none`                         |
| `index-of?`   | seq T         | `(some idx)` or `none`                         |
| `slice?`      | seq uint uint | Subseq or `none`                               |
| `map`         | fn seq...     | `(map + lst1 lst2)`                            |
| `filter`      | pred seq      | Filtered seq (`filter is-some?` for optionals) |
| `fold`        | fn seq init   | Reduced val                                    |

### Persistence

| Fn                                                       | Usage/Example    |
| -------------------------------------------------------- | ---------------- |
| `(var-get var)`                                          | Read data-var    |
| `(var-set var val)` → `true`                             | Write            |
| `(map-get? map key)` → `(some val)`/`none`               | Read             |
| `(map-insert map key val)` → `true`/`false` (if existed) | Insert if absent |
| `(map-set map key val)` → `true`                         | Overwrite        |
| `(map-delete map key)` → `true`/`false`                  | Delete           |

### Tokens

#### Fungible (define-fungible-token token)

| Fn               | Args                 | Returns     |
| ---------------- | -------------------- | ----------- |
| `ft-mint?`       | token uint principal | `(ok true)` |
| `ft-transfer?`   | token uint from to   | `(ok true)` |
| `ft-burn?`       | token uint from      | `(ok true)` |
| `ft-get-balance` | token principal      | `uint`      |
| `ft-get-supply`  | token                | `uint`      |

#### Non-Fungible (define-non-fungible-token nft id-T)

| Fn               | Args             | Returns                   |
| ---------------- | ---------------- | ------------------------- |
| `nft-mint?`      | nft id principal | `(ok true)`               |
| `nft-transfer?`  | nft id from to   | `(ok true)`               |
| `nft-burn?`      | nft id from      | `(ok true)`               |
| `nft-get-owner?` | nft id           | `(some principal)`/`none` |

#### STX

| Fn                   | Args              | Returns/Example                 |
| -------------------- | ----------------- | ------------------------------- |
| `stx-get-balance`    | principal         | `uint` (uSTX)                   |
| `stx-transfer?`      | uint from to      | `(ok true)`                     |
| `stx-burn?`          | uint from         | `(ok true)`                     |
| `stx-transfer-memo?` | uint from to buff | `(ok true)`                     |
| `stx-account`        | principal         | `{locked, unlock-ht, unlocked}` |

### Contracts & Calls

| Fn                 | Args                       | Returns                                                             |
| ------------------ | -------------------------- | ------------------------------------------------------------------- |
| `contract-call?`   | .contract fn args...       | Resp from fn                                                        |
| `contract-of`      | `<trait>`                  | Principal                                                           |
| `as-contract?`     | allowances\* body...       | `(response A u)` (Clarity 4: restricts outflows; proxy-attack risk) |
| `restrict-assets?` | owner allowances\* body... | `(response A u)` (Clarity 4; mirrors as-contract)                   |
| `contract-hash?`   | principal                  | `(response (buff 32) u)` (Clarity 4)                                |

**Asset Allowances (Clarity 4)**:

```
(with-stx uint)
(with-ft principal token-name uint) ;; or "*"
(with-nft principal token-name (list id-T)) ;; or "*"
(with-stacking uint)
(with-all-assets-unsafe) ;; DANGER: unrestricted
```

**Notes**: `as-contract` changes `tx-sender`/`contract-caller` to `SELF`; use for treasury/agent ops. [ccd002-treasury-v3](https://github.com/citycoins/protocol/blob/main/contracts/extensions/ccd002-treasury-v3.clar), [aibtc-agent-account](https://github.com/aibtcdev/aibtcdev-daos/blob/main/contracts/agent/aibtc-agent-account.clar)

### Crypto/Hash

| Fn                   | Args                     | Returns                  |
| -------------------- | ------------------------ | ------------------------ |
| `hash160`            | buff/int/uint            | `(buff 20)`              |
| `sha256`             | any                      | `(buff 32)`              |
| `sha512`             | any                      | `(buff 64)`              |
| `sha512/256`         | any                      | `(buff 32)`              |
| `keccak256`          | any                      | `(buff 32)`              |
| `secp256k1-recover?` | hash (buff 65)           | `(response (buff 33) u)` |
| `secp256k1-verify`   | hash sig(64/65) pubkey   | `bool`                   |
| `secp256r1-verify`   | hash (buff 64) (buff 33) | `bool` (Clarity 4)       |

### Conversions

| Fn                   | Args                 | Returns/Example                                   |
| -------------------- | -------------------- | ------------------------------------------------- |
| `to-int`             | uint                 | `int` (no ≥2^127)                                 |
| `to-uint`            | int                  | `uint` (no <0)                                    |
| `to-ascii?`          | simple/buff/str-utf8 | `(response (string-ascii 1048571) u)` (Clarity 4) |
| `int-to-ascii`       | int/uint             | `(string-ascii 40)`                               |
| `buff-to-int-be/le`  | `(buff 16)`          | `int`                                             |
| `buff-to-uint-be/le` | `(buff 16)`          | `uint`                                            |

### Other Utilities

| Fn           | Args               | Returns                   |
| ------------ | ------------------ | ------------------------- |
| `ok`/`err`   | val                | `(response ...)`          |
| `some`       | val                | `(optional ...)`          |
| `default-to` | def `(optional T)` | `T`                       |
| `merge`      | tuple tuple        | tuple                     |
| `print`      | any                | any (logs)                |
| `at-block`   | hash expr          | expr (read-only historic) |

## Patterns

### Public Fn Template

```
(define-public (transfer (amount uint) (to principal))
  (begin
    (asserts! (is-eq tx-sender owner) ERR_UNAUTHORIZED)
    (try! (ft-transfer? TOKEN amount tx-sender to))
    (ok true)))
```

- Use `try!` for subcalls.
- `asserts!` for guards.
- Post-conditions on tx for asset safety.

### Events (print)

```
(print {
  notification: "contract-event",
  payload: {amount, sender, recipient}
})
```

- Standardized: `notification` (string), `payload` (tuple camelCase). [usabtc-token](https://github.com/USA-BTC/smart-contracts/blob/main/contracts/usabtc-token.clar), [ccd002-treasury-v3](https://github.com/citycoins/protocol/blob/main/contracts/extensions/ccd002-treasury-v3.clar)

### Error Handling

```
(match (contract-call? .other fn args)
  success (ok success)
  error (err ERR_EXTERNAL_CALL_FAILED))
```

### Bit Flags (status/permissions)

```
(define-constant STATUS_ACTIVE (pow u2 u0)) ;; 1
(define-constant STATUS_PAID (pow u2 u1))   ;; 2
;; Pack: (+ STATUS_ACTIVE STATUS_PAID) → u3
;; Check: (> (bit-and status STATUS_ACTIVE) u0)
;; Set: (var-set status (bit-or status NEW_FLAG))
```

[aibtc-action-proposal-voting](https://github.com/aibtcdev/aibtcdev-daos/blob/main/contracts/dao/extensions/aibtc-action-proposal-voting.clar), [aibtc-agent-account](https://github.com/aibtcdev/aibtcdev-daos/blob/main/contracts/agent/aibtc-agent-account.clar)

### Multi-Send Example

```
(define-private (send-maybe (recipient {to: principal, ustx: uint}) (prior (response bool uint)))
  (match prior ok-result
    (let (
      (to (get to recipient))
      (ustx (get ustx recipient)))
      (try! (stx-transfer? ustx tx-sender to))
      (ok true))
    err-result err-result))

(define-public (send-many (recipients (list 200 {to: principal, ustx: uint})))
  (fold send-maybe recipients (ok true)))
```

### Multi-Party Coordination (ERC-8001/SIP-XXX)

All-party sig agg w/ expiry/nonce/replay prot. Propose intent (sorted participants), accepts via off-chain EIP712-like sig (recover on-chain), execute if Ready/fresh/payload-match.

Ref: `contracts/erc-8001.clar` (max20 decidable; sha256/BE32; trait IAgentCoordination).

Ex: Propose → N accepts → status Ready → execute (payload); cancel/expire edges.

### Parent-Child Maps (hierarchical, paginated)

```
(define-map Parents uint {name: (string-ascii 32), lastChildId: uint})
(define-map Children {parentId: uint, id: uint} uint) ;; value

(define-read-only (get-child (parentId uint) (childId uint))
  (map-get? Children {parentId: parentId, id: childId}))

(define-private (is-some? (x (optional uint)))
  (is-some x))

(define-read-only (get-children (parentId uint) (shift uint))
  (filter is-some?
    (list
      (get-child parentId (+ shift u1))
      (get-child parentId (+ shift u2))
      (get-child parentId (+ shift u3))
      (get-child parentId (+ shift u4))
      (get-child parentId (+ shift u5))
      (get-child parentId (+ shift u6))
      (get-child parentId (+ shift u7))
      (get-child parentId (+ shift u8))
      (get-child parentId (+ shift u9))
      (get-child parentId (+ shift u10))
    )))

### Whitelisting (assets/contracts)
```

(define-map Allowed {contract: principal, type: uint} bool)
(asserts! (default-to false (map-get? Allowed {...})) ERR_NOT_ALLOWED)
(define-public (set-allowed-list (items (list 100 {token: principal, enabled: bool})))
(ok (map set-iter items (ok true))))

```
[ccd002-treasury-v3](https://github.com/citycoins/protocol/blob/main/contracts/extensions/ccd002-treasury-v3.clar), [aibtc-agent-account](https://github.com/aibtcdev/aibtcdev-daos/blob/main/contracts/agent/aibtc-agent-account.clar)

### Delayed Activation
```

(define-constant DELAY u21000) ;; BTC blocks
(define-data-var activation-block uint u0)
(var-set activation-block (+ burn-block-height DELAY))
(define-read-only (is-active?) (>= burn-block-height (var-get activation-block)))

```
[usabtc-token](https://github.com/USA-BTC/smart-contracts/blob/main/contracts/usabtc-token.clar)

### DAO Proposals (historic balances, quorum)
```

;; Historic vote power
(at-block proposal-block-hash (contract-call? .token get-balance voter))
;; Quorum: (>= (/ (\* total-votes u100) liquid-supply) u15)
(define-map Proposals uint {votesFor: uint, status: uint, liquidTokens: uint})

```
[aibtc-action-proposal-voting](https://github.com/aibtcdev/aibtcdev-daos/blob/main/contracts/dao/extensions/aibtc-action-proposal-voting.clar)

## Security
- **Guards**: Token side-effects → `tx-sender` (post-cond safe); others → `contract-caller` (anti-phish). Add 1μSTX tx for tx-sender flex.
- **Traits**: Whitelist: `asserts! (default-to false (map-get? TrustedTraits (contract-of t))) ERR_UNTRUSTED`.
- **as-contract/restrict-assets?**: Explicit allowances only; no unrestricted traits (drain risk).
- **Rate-limits**: `(asserts! (> burn-block-height (var-get last-block)) ERR_RATE_LIMIT)`. [aibtc-action-proposal-voting](https://github.com/aibtcdev/aibtcdev-daos/blob/main/contracts/dao/extensions/aibtc-action-proposal-voting.clar)
- **Audit**: GREEN (harmless RO)/YELLOW/ORANGE/RED (critical side-effects); check reentrancy-free.

## Stacking (PoX-4+)
- `stack-stx`: Solo.
- `delegate-stx`: To pool.
- `delegate-stack-stx`: Pool partial.
- `stack-aggregation-commit-indexed`: Pool commit.
- `stack-aggregation-increase`: Pool extend.

## BNS Example Ops
- `name-preorder`/`name-register`: Register.
- `name-renewal`/`name-transfer`/`name-update`: Manage.

## Execution Costs (per tx/block; RO stricter)
| Category | Block | RO     |
|----------|-------|--------|
| Runtime  | 5e9   | 1e9    |
| Read cnt | 15k   | 30     |
| Read len | 1e8B  | 1e5B   |
| Write cnt| 15k   | 0      |
| Write len| 1.5e7B| 0      |
- Opt: Inline single-use `let`; const > var; bulk > fold (<10 elems); separate params > tuples (cheaper calls); off-chain UI.

## Tools
- Clarinet: Local dev/test/deploy (`::get-costs`).
- Explorer: Verify txs.
- Stacks.js: Tx building/calls.

Version: Clarity 4 (post Bitcoin #923222).
```
