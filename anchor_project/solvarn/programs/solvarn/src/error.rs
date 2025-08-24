use anchor_lang::prelude::*;

#[error_code]
pub enum PoolError {
    #[msg("The specified duration is invalid")]
    InvalidDuration,

    #[msg("The specified deposit amount is invalid")]
    InvalidAmount,

    #[msg("The game has already ended")]
    GameEnded,

    #[msg("The game is still active")]
    GameNotEnded,

    #[msg("The amount calculation caused an overflow")]
    Overflow,

    #[msg("The provided authority is not valid")]
    InvalidAuthority,

    #[msg("The specified winner is not valid")]
    InvalidWinner,

    #[msg("The prize pot is empty")]
    EmptyPot,

    #[msg("The prize has already been claimed")]
    AlreadyClaimed,
}
