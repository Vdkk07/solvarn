# Project Description

**Deployed Frontend URL:** [https://solvarn.vercel.app/](https://solvarn.vercel.app/)

**Solana Program ID:** `Hvm2g2j3cCPfDnwhf1QcVQfV3xVbr2m73NmDUasRqjeT`

## Project Overview

### Description

This capstone project is a Solana-based prize pool game where users can create timed SOL pools, deposit progressively larger amounts and compete to be the last depositor before the timer runs out.

- **Pool Creation:** Anyone can create a pool with a specific duration.

- **Progressive Deposits:** Each deposit must be greater than the last, and each valid deposit extends the countdown.

- **Winner Takes All:** Once time expires, the last depositor becomes the winner and can claim the entire pot.

### Key Features

- Feature 1: Create Pool - Initialize a new prize pool with a fixed duration.
- Feature 2: Deposit SOL - Participate by depositing SOL greater than the previous deposit.
- Feature 3: Auto-Extending Countdown - Timer starts on the first deposit and resets with each new one.
- Feature 4: Claim Winnings - Last depositor can claim the total pot when the timer ends.
- Feature 5: Real-Time Pool Data - Displays pot balance, last depositor, last deposit amount, and countdown timer.

### How to Use the dApp

[TODO: Provide step-by-step instructions for users to interact with your dApp]

1. **Connect Wallet**
2. **Create a Pool**
   - Enter a duration and initialize the pool.
3. **Deposit into a Pool**
   - Select a pool and deposit SOL, the deposit must be larger than the previous amount.
4. **Claim the Pot**
   - Once the timer expires, the last depositor can claim the entire pool balance.

## Program Architecture

This project uses Anchor to build the Solana smart contract and Program Derived Addresses (PDAs) for secure account handling.

### PDA Usage

**PDAs Used:**

- **Pool PDA:** Derived from seeds `["pool", authority_pubkey]` - Escrows all SOL deposited in the pool and stores the game’s state.

### Program Instructions

**Solvarn Program:**

- **InitializePool:** Creates a new pool with a specified duration and authority.
- **Deposit:** Allows users to deposit SOL into the pool. Starts the pool timer on the first deposit. Records the last depositor.
- **Claim:** Allows the last depositor to claim the entire pool prize after the pool duration has ended. Closes the pool account.

### Account Structure

```rust
#[account]
pub struct Pool {

    pub authority: Pubkey,          /// Pool creator (authority, used in PDA seed)
    pub game_active: bool,          /// Is the pool still active?
    pub duration_seconds: i64,      /// Fixed duration (seconds) for each countdown period
    pub end_timestamp: i64,         /// Current end timestamp (set/extended on deposits)
    pub last_depositor: Pubkey,     /// Last user to deposit into the pool
    pub last_deposit_amount: u64,   /// Amount of the last deposit (lamports)
    pub pot_amount: u64,            /// Total pot amount in lamports held by this PDA
}

```

## Testing

```
├── anchor_project/
    │   ├── solvarn/   # solvarn on-chain program
            ├── tests/
            │   ├── solvarn.ts      # Tests for Solvarn
            ├── Anchor.toml         # Anchor config
            └── README.md

```

### Test Coverage

[TODO: Describe your testing approach and what scenarios you covered]

**Happy Path Tests:**

- Test 1: Pool initialized successfully
- Test 2: First deposit starts the game
- Test 3: New deposit extends timer
- Test 4: Winner can claim prize after game ends

**Unhappy Path Tests:**

- Test 1: Cannot initialize pool twice (Authority tries to initialize again)
- Test 2: Fails if new deposit is not greater than last
- Test 3: Fails if deposit amount is zero
- Test 4: Should fail if game has not ended yet
- Test 5: Should fail if a non-winner tries to claim

### Running Tests

```bash
# Commands to run your tests
cd anchor_project
cd solvarn
yarn install
anchor build
anchor test
```

### Additional Notes for Evaluators

- Demonstrates use of PDAs, CPIs, and time-based logic.
- Includes validation for pool creation, deposits, and reward claims.
- Fully tested for success and failure cases.
- Supports multiple pools and flexible durations.
- Ready for frontend integration as a complete dApp.
