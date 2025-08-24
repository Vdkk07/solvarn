use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::{error::PoolError, ClaimPoolEvent, Pool, POOL_SEED};

#[derive(Accounts)]
pub struct ClaimPrize<'info> {
    #[account(mut)]
    pub claimer: Signer<'info>,

    #[account(mut)]
    pub authority: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [POOL_SEED, pool.authority.key().as_ref()],
        bump,
        has_one = authority @ PoolError::InvalidAuthority,
        close = authority
    )]
    pub pool: Box<Account<'info, Pool>>,

    pub system_program: Program<'info, System>,
}

pub fn claim_prize(ctx: Context<ClaimPrize>) -> Result<()> {
    let pool = &mut ctx.accounts.pool;
    let claimer = &ctx.accounts.claimer;

    let clock = Clock::get()?;

    // Check game has ended
    require!(
        clock.unix_timestamp >= pool.end_timestamp,
        PoolError::GameNotEnded
    );

    // Check  prize hasn't been claimed already
    require!(pool.game_active, PoolError::AlreadyClaimed);

    // Check pot is not empty
    require!(pool.pot_amount > 0, PoolError::EmptyPot);

    // Check the claimer is the actual winner
    require!(
        claimer.key() == pool.last_depositor,
        PoolError::InvalidWinner
    );

    // Update state BEFORE transfer (atomic safety)
    pool.game_active = false;

    // When i use this approach then claim test failed because claim instruction tries to Transfer from the pool account (with data) → winner

    // // Prepare signer seeds
    // let bump = ctx.bumps.pool;
    // let authority_key = pool.authority.key();

    // let signer_seeds: &[&[&[u8]]] = &[&[POOL_SEED, authority_key.as_ref(), &[bump]]];

    // // Transfer SOL to claimer account
    // let cpi_context = CpiContext::new_with_signer(
    //     ctx.accounts.system_program.to_account_info(),
    //     Transfer {
    //         from: pool.to_account_info(),
    //         to: claimer.to_account_info(),
    //     },
    //     signer_seeds,
    // );

    // transfer(cpi_context, pool.pot_amount)?;

    **pool.to_account_info().try_borrow_mut_lamports()? -= pool.pot_amount;
    **claimer.try_borrow_mut_lamports()? += pool.pot_amount;

    emit!(ClaimPoolEvent {
        pool: pool.key(),
        claimer: ctx.accounts.claimer.key(),
        amount: pool.pot_amount,
        is_winner: true, // or false based on your logic
    });

    Ok(())
}
