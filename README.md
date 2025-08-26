# Solvarn

A Solana-based decentralized pooling dApp where users can create pools with custom durations, deposit SOL, and the last depositor claims the prize after the pool ends.

## Demo Video

https://github.com/user-attachments/assets/7eb29c0e-d58a-47ca-931d-5efdda4b43b0

## Features
- Create and manage multiple SOL pools with flexible durations.
- Real-time tracking of deposits and pool status.
- Automatic prize distribution to the last depositor.
- Built with Solana, Anchor, Next.js, and Tailwind CSS.

## How It Works
1. **Create Pool** – Set pool duration and initialize it.
2. **Deposit SOL** – Users join the pool, triggering the countdown.
3. **Claim Prize** – The last depositor claims all SOL when the timer ends.

## Smart Contract Highlights
- PDA-based state management.
- Time-based validation for pools.
- Fully tested with both positive and negative test cases.

