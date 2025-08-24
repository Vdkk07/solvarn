use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::{error::PoolError, DepositEvent, Pool, POOL_SEED};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub depositor: Signer<'info>,

    #[account(mut)]
    pub authority: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.authority.key().as_ref()],
        bump,
        has_one = authority @ PoolError::InvalidAuthority
    )]
    pub pool: Box<Account<'info, Pool>>,

    pub system_program: Program<'info, System>,
}

pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    // Check game active and not ended
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp <= pool.end_timestamp && pool.game_active,
        PoolError::GameEnded
    );

    // Check amount
    require!(amount > pool.last_deposit_amount, PoolError::InvalidAmount);

    // Transfer SOL to pool PDA
    let cpi_context = CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        Transfer {
            from: ctx.accounts.depositor.to_account_info(),
            to: pool.to_account_info(),
        },
    );

    transfer(cpi_context, amount)?;

    // Update pool state
    pool.last_depositor = ctx.accounts.depositor.key();
    pool.last_deposit_amount = amount;
    pool.pot_amount = pool
        .pot_amount
        .checked_add(amount)
        .ok_or(PoolError::Overflow)?;

    // Reset 24 hours timer
    pool.end_timestamp = clock.unix_timestamp + pool.duration_seconds;

    emit!(DepositEvent {
        pool: pool.key(),
        depositor: ctx.accounts.depositor.key(),
        amount,
    });

    Ok(())
}
