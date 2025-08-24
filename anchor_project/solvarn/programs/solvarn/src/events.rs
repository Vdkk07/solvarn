use anchor_lang::prelude::*;

#[event]
pub struct InitializePoolEvent {
    pub authority: Pubkey,
    pub end_timestamp: i64,
    pub game_active: bool,
}

#[event]
pub struct DepositEvent {
    pub pool: Pubkey,
    pub depositor: Pubkey,
    pub amount: u64,
}

#[event]
pub struct ClaimPoolEvent {
    pub pool: Pubkey,
    pub claimer: Pubkey,
    pub amount: u64,
    pub is_winner: bool,
}
