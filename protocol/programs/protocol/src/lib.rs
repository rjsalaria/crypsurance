//! CrypSurance — parametric cover protocol (M2).
//!
//! Replaces the memo-based prototype with real on-chain state:
//!
//! * a **Policy** is a PDA account, not a transaction memo, so its terms are
//!   structured data the chain enforces rather than a JSON blob we agree to
//!   interpret consistently;
//! * premiums live in a **vault owned by a program PDA**, so no human key —
//!   including ours — can move them. Funds leave only through `settle_claim`,
//!   and only to the policy's own holder;
//! * the premium is computed **on-chain** from the payout, so a client cannot
//!   under-pay for cover.
//!
//! The oracle still decides whether a claim is valid (that is a data problem,
//! and M5's verifier network is where it decentralises). What changes here is
//! that the oracle can no longer decide *where the money goes* — it can only
//! approve, deny, or escalate, and an approval always pays the holder.

use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("4V7SWWpKRqFF5QZhPYKBMxHeEag3g2Cr1mhbtaSUjtdr");

/// Premium as basis points of the payout (2.4%), matching the demo pricing.
pub const PREMIUM_BPS: u64 = 240;
pub const BPS_DENOM: u64 = 10_000;

pub const MIN_PAYOUT: u64 = 1_000;
pub const MAX_PAYOUT: u64 = 50_000;

#[program]
pub mod protocol {
    use super::*;

    /// Create the pool and its vault. The vault's authority is the pool PDA,
    /// which is what makes the funds unspendable by any private key.
    pub fn initialize_pool(ctx: Context<InitializePool>, oracle: Pubkey) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.oracle = oracle;
        pool.mint = ctx.accounts.mint.key();
        pool.policies = 0;
        pool.claims_paid = 0;
        pool.claims_denied = 0;
        pool.bump = ctx.bumps.pool;
        pool.vault_bump = ctx.bumps.vault;
        Ok(())
    }

    /// Hand the oracle role to a different key (admin only).
    pub fn set_oracle(ctx: Context<SetOracle>, new_oracle: Pubkey) -> Result<()> {
        ctx.accounts.pool.oracle = new_oracle;
        Ok(())
    }

    /// Buy cover. The premium is derived from the payout here rather than
    /// taken from the caller, so it cannot be understated.
    pub fn buy_cover(
        ctx: Context<BuyCover>,
        nonce: u64,
        flight: String,
        date: String,
        payout: u64,
    ) -> Result<()> {
        require!(
            payout >= MIN_PAYOUT && payout <= MAX_PAYOUT,
            CoverError::PayoutOutOfRange
        );
        require!(
            !flight.is_empty() && flight.len() <= 16,
            CoverError::BadFlight
        );
        require!(date.len() == 10, CoverError::BadDate);

        let premium = payout
            .checked_mul(PREMIUM_BPS)
            .ok_or(CoverError::MathOverflow)?
            / BPS_DENOM;
        let premium = if premium == 0 { 1 } else { premium };

        // Premium in. The holder signs this transfer themselves.
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.holder_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.holder.to_account_info(),
                },
            ),
            premium,
        )?;

        let policy = &mut ctx.accounts.policy;
        policy.pool = ctx.accounts.pool.key();
        policy.holder = ctx.accounts.holder.key();
        policy.nonce = nonce;
        policy.flight = flight;
        policy.date = date;
        policy.payout = payout;
        policy.premium = premium;
        policy.status = PolicyStatus::Active;
        policy.created_at = Clock::get()?.unix_timestamp;
        policy.settled_at = 0;
        policy.basis = String::new();
        policy.bump = ctx.bumps.policy;

        let flight_out = policy.flight.clone();
        let date_out = policy.date.clone();
        let policy_key = policy.key();
        let holder_key = policy.holder;

        let pool = &mut ctx.accounts.pool;
        pool.policies = pool.policies.saturating_add(1);

        emit!(CoverBought {
            policy: policy_key,
            holder: holder_key,
            flight: flight_out,
            date: date_out,
            payout,
            premium,
        });
        Ok(())
    }

    /// Ask for the claim to be assessed. Only the holder can do this, and only
    /// on a policy that hasn't already been claimed or settled.
    pub fn file_claim(ctx: Context<FileClaim>) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        require!(
            policy.status == PolicyStatus::Active,
            CoverError::NotClaimable
        );
        policy.status = PolicyStatus::Requested;

        emit!(ClaimFiled {
            policy: policy.key(),
            holder: policy.holder,
        });
        Ok(())
    }

    /// Oracle verdict. `approved` pays the full payout from the vault to the
    /// holder; otherwise the claim is denied. The oracle cannot choose the
    /// recipient or the amount — both come from the policy account.
    pub fn settle_claim(ctx: Context<SettleClaim>, approved: bool, basis: String) -> Result<()> {
        require!(basis.len() <= 64, CoverError::BasisTooLong);
        require!(
            ctx.accounts.policy.status == PolicyStatus::Requested
                || ctx.accounts.policy.status == PolicyStatus::Escalated,
            CoverError::NotSettleable
        );

        if approved {
            let payout = ctx.accounts.policy.payout;
            require!(
                ctx.accounts.vault.amount >= payout,
                CoverError::PoolUnderfunded
            );

            // The vault's authority is the pool PDA, so the program signs.
            let pool_bump = ctx.accounts.pool.bump;
            let seeds: &[&[u8]] = &[b"pool", core::slice::from_ref(&pool_bump)];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.vault.to_account_info(),
                        to: ctx.accounts.holder_token.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    &[seeds],
                ),
                payout,
            )?;
        }

        let policy = &mut ctx.accounts.policy;
        policy.status = if approved {
            PolicyStatus::Paid
        } else {
            PolicyStatus::Denied
        };
        policy.settled_at = Clock::get()?.unix_timestamp;
        policy.basis = basis.clone();

        let policy_key = policy.key();
        let holder_key = policy.holder;
        let amount = if approved { policy.payout } else { 0 };

        let pool = &mut ctx.accounts.pool;
        if approved {
            pool.claims_paid = pool.claims_paid.saturating_add(1);
        } else {
            pool.claims_denied = pool.claims_denied.saturating_add(1);
        }

        emit!(ClaimSettled {
            policy: policy_key,
            holder: holder_key,
            approved,
            amount,
            basis,
        });
        Ok(())
    }

    /// The data was inconclusive: hand the claim to human verification rather
    /// than guessing. It stays settleable afterwards.
    pub fn escalate_claim(ctx: Context<SettleClaim>, reason: String) -> Result<()> {
        require!(reason.len() <= 64, CoverError::BasisTooLong);
        let policy = &mut ctx.accounts.policy;
        require!(
            policy.status == PolicyStatus::Requested,
            CoverError::NotSettleable
        );
        policy.status = PolicyStatus::Escalated;
        policy.basis = reason.clone();

        emit!(ClaimEscalated {
            policy: policy.key(),
            reason,
        });
        Ok(())
    }
}

/* ------------------------------------------------------------------ */
/* state                                                               */
/* ------------------------------------------------------------------ */

#[account]
#[derive(InitSpace)]
pub struct Pool {
    pub authority: Pubkey,
    pub oracle: Pubkey,
    pub mint: Pubkey,
    pub policies: u64,
    pub claims_paid: u64,
    pub claims_denied: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Policy {
    pub pool: Pubkey,
    pub holder: Pubkey,
    pub nonce: u64,
    #[max_len(16)]
    pub flight: String,
    #[max_len(10)]
    pub date: String,
    pub payout: u64,
    pub premium: u64,
    pub status: PolicyStatus,
    pub created_at: i64,
    pub settled_at: i64,
    #[max_len(64)]
    pub basis: String,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum PolicyStatus {
    Active,
    Requested,
    Escalated,
    Paid,
    Denied,
}

/* ------------------------------------------------------------------ */
/* contexts                                                            */
/* ------------------------------------------------------------------ */

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Pool::INIT_SPACE,
        seeds = [b"pool"],
        bump
    )]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = authority,
        seeds = [b"vault", pool.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SetOracle<'info> {
    #[account(mut, seeds = [b"pool"], bump = pool.bump, has_one = authority)]
    pub pool: Account<'info, Pool>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(nonce: u64)]
pub struct BuyCover<'info> {
    #[account(mut)]
    pub holder: Signer<'info>,

    #[account(mut, seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = holder,
        space = 8 + Policy::INIT_SPACE,
        seeds = [b"policy", holder.key().as_ref(), &nonce.to_le_bytes()],
        bump
    )]
    pub policy: Account<'info, Policy>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = holder_token.owner == holder.key() @ CoverError::WrongTokenOwner,
        constraint = holder_token.mint == pool.mint @ CoverError::WrongMint
    )]
    pub holder_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct FileClaim<'info> {
    pub holder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"policy", holder.key().as_ref(), &policy.nonce.to_le_bytes()],
        bump = policy.bump,
        has_one = holder @ CoverError::NotPolicyHolder
    )]
    pub policy: Account<'info, Policy>,
}

#[derive(Accounts)]
pub struct SettleClaim<'info> {
    /// Only the pool's designated oracle may assess a claim.
    #[account(constraint = oracle.key() == pool.oracle @ CoverError::NotOracle)]
    pub oracle: Signer<'info>,

    #[account(mut, seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"policy", policy.holder.as_ref(), &policy.nonce.to_le_bytes()],
        bump = policy.bump
    )]
    pub policy: Account<'info, Policy>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Must belong to the policy holder — the oracle cannot redirect a payout.
    #[account(
        mut,
        constraint = holder_token.owner == policy.holder @ CoverError::WrongTokenOwner,
        constraint = holder_token.mint == pool.mint @ CoverError::WrongMint
    )]
    pub holder_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/* ------------------------------------------------------------------ */
/* events + errors                                                     */
/* ------------------------------------------------------------------ */

#[event]
pub struct CoverBought {
    pub policy: Pubkey,
    pub holder: Pubkey,
    pub flight: String,
    pub date: String,
    pub payout: u64,
    pub premium: u64,
}

#[event]
pub struct ClaimFiled {
    pub policy: Pubkey,
    pub holder: Pubkey,
}

#[event]
pub struct ClaimSettled {
    pub policy: Pubkey,
    pub holder: Pubkey,
    pub approved: bool,
    pub amount: u64,
    pub basis: String,
}

#[event]
pub struct ClaimEscalated {
    pub policy: Pubkey,
    pub reason: String,
}

#[error_code]
pub enum CoverError {
    #[msg("Payout is outside the permitted range")]
    PayoutOutOfRange,
    #[msg("Flight number is missing or too long")]
    BadFlight,
    #[msg("Date must be YYYY-MM-DD")]
    BadDate,
    #[msg("Arithmetic overflow")]
    MathOverflow,
    #[msg("This policy cannot be claimed in its current state")]
    NotClaimable,
    #[msg("This claim cannot be settled in its current state")]
    NotSettleable,
    #[msg("Only the pool oracle may settle claims")]
    NotOracle,
    #[msg("Only the policy holder may file this claim")]
    NotPolicyHolder,
    #[msg("Token account has the wrong owner")]
    WrongTokenOwner,
    #[msg("Token account has the wrong mint")]
    WrongMint,
    #[msg("The pool does not hold enough to cover this payout")]
    PoolUnderfunded,
    #[msg("Basis string is too long")]
    BasisTooLong,
}
