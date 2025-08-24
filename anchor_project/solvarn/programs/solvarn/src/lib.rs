pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use events::*;
pub use instructions::*;
pub use state::*;

declare_id!("Hvm2g2j3cCPfDnwhf1QcVQfV3xVbr2m73NmDUasRqjeT");

#[program]
pub mod solvarn {
    use super::*;

    pub fn init_pool(ctx: Context<InitializePool>, duration_seconds: i64) -> Result<()> {
        initialize_pool(ctx, duration_seconds)
    }

    pub fn deposit_sol(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        deposit(ctx, amount)
    }

    pub fn claim(ctx: Context<ClaimPrize>) -> Result<()> {
        claim_prize(ctx)
    }
}
