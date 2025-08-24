use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    pub pot_amount: u64,
    pub last_depositor: Pubkey,
    pub last_deposit_amount: u64,
    pub end_timestamp: i64,
    pub game_active: bool,
    pub bump: u8,
    pub duration_seconds: i64,
}
