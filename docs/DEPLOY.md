# Bitcoin Agents Deployment Guide

## Prerequisites

1. **Clarinet** installed (v2.0+)
2. **Stacks testnet/mainnet wallet** with sufficient STX for deployment
3. **Environment variables** configured

## Environment Setup

Create a `.env` file (DO NOT commit to git):

```bash
# Testnet deployer mnemonic (24 words)
DEPLOYER_MNEMONIC="your twenty four word mnemonic phrase goes here..."

# Or use secret key directly
# DEPLOYER_SECRET_KEY="your-hex-secret-key"
```

## Deployment Commands

### Check Contracts

```bash
clarinet check
```

### Run Tests

```bash
bun run test
```

### Deploy to Testnet

```bash
# Set your mnemonic in environment
export DEPLOYER_MNEMONIC="your mnemonic here"

# Deploy all contracts
clarinet deploy --network testnet
```

### Deploy to Mainnet

```bash
# Set your mnemonic in environment
export DEPLOYER_MNEMONIC="your mainnet mnemonic here"

# Deploy all contracts
clarinet deploy --network mainnet
```

## Contract Addresses

After deployment, update the following files with the deployed addresses:

### Backend (`aibtcdev-backend`)
- `app/tools/bitcoin_agents.py`: Update `CONTRACT_MAINNET` and `CONTRACT_TESTNET`
- `app/api/bitcoin_agents.py`: Update `CONTRACT_ADDRESS_MAINNET` and `CONTRACT_ADDRESS_TESTNET`

### Frontend (`aibtcdev-frontend`)
- `src/services/bitcoin-agents.service.ts`: Update API endpoint if needed

## Deployed Contracts

The Bitcoin Agents system deploys 4 contracts:

| Contract | Purpose |
|----------|---------|
| `identity-registry` | ERC-8004 agent identity registration |
| `reputation-registry` | Client feedback and reviews |
| `validation-registry` | Validator requests/responses |
| `bitcoin-agents` | Core Tamagotchi lifecycle (mint, feed, death) |

## Post-Deployment Verification

1. **Verify contract deployment:**
   ```bash
   # Using Hiro API
   curl "https://api.testnet.hiro.so/extended/v1/contract/{deployer}.bitcoin-agents"
   ```

2. **Test mint function:**
   ```clarity
   ;; In clarinet console or via API
   (contract-call? .bitcoin-agents mint-agent u"TestAgent")
   ```

3. **Verify agent state:**
   ```clarity
   (contract-call? .bitcoin-agents get-agent u0)
   ```

## Contract Configuration

Key constants in `bitcoin-agents.clar`:

| Constant | Value | Description |
|----------|-------|-------------|
| `MINT_COST` | 10,000 sats | Cost to mint new agent |
| `FOOD_TIER_1_COST` | 100 sats | Basic food cost |
| `FOOD_TIER_2_COST` | 500 sats | Premium food cost |
| `FOOD_TIER_3_COST` | 1,000 sats | Gourmet food cost |
| `HUNGER_DECAY_RATE` | 1 per 144 blocks | ~1% per day |
| `HEALTH_DECAY_RATE` | 1 per 72 blocks | ~2% per day when starving |

## Rollback Plan

Clarity contracts are immutable once deployed. If issues are found:

1. **Minor issues:** Deploy a new version with fixes, migrate users
2. **Critical issues:**
   - Use admin functions if available (pause, etc.)
   - Deploy new contract
   - Refund affected users if needed

## Security Checklist

Before mainnet deployment:

- [ ] All 95 tests passing
- [ ] Clarinet check passes with no errors
- [ ] Manual testing on testnet complete
- [ ] Payment flow validated with testnet sBTC
- [ ] Death mechanics verified (agents actually die)
- [ ] XP and evolution thresholds correct
- [ ] Error handling tested for all edge cases
