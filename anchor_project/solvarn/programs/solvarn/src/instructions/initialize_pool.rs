use anchor_lang::prelude::*;

use crate::{error::PoolError, InitializePoolEvent, Pool, POOL_SEED};

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [POOL_SEED, authority.key().as_ref()],
        bump
    )]
    pub pool: Box<Account<'info, Pool>>,

    pub system_program: Program<'info, System>,
}

pub fn initialize_pool(ctx: Context<InitializePool>, duration_seconds: i64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let authority_key = ctx.accounts.authority.key();
    let clock = Clock::get()?;

    require!(duration_seconds > 0, PoolError::InvalidDuration);

    pool.set_inner(Pool {
        authority: authority_key,
        pot_amount: 0,
        last_depositor: Pubkey::default(),
        last_deposit_amount: 0,
        end_timestamp: clock.unix_timestamp + duration_seconds,
        game_active: true,
        bump: pool.bump,
        duration_seconds: duration_seconds,
    });

    emit!(InitializePoolEvent {
        authority: authority_key,
        end_timestamp: clock.unix_timestamp + duration_seconds,
        game_active: true,
    });

    Ok(())
}
