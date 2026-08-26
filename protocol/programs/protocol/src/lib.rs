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

/// Payout and premium are denominated in **whole tokens** throughout the
/// protocol's public surface (a 10,000 SURETY payout is `payout = 10_000`),
/// matching how the product talks about cover. Token transfers need base
/// units, so every transfer converts using the mint's decimals — recorded on
/// the pool at initialisation rather than hardcoded.
pub const MIN_PAYOUT: u64 = 1_000;
pub const MAX_PAYOUT: u64 = 50_000;

/// Whole tokens -> base units for the pool's mint.
fn to_base_units(amount: u64, decimals: u8) -> Result<u64> {
    let factor = 10u64
        .checked_pow(decimals as u32)
        .ok_or(CoverError::MathOverflow)?;
    Ok(amount.checked_mul(factor).ok_or(CoverError::MathOverflow)?)
}

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
        pool.decimals = ctx.accounts.mint.decimals;
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

    /* -------------------------------------------------------------- */
    /* M3: the operator registry                                       */
    /* -------------------------------------------------------------- */

    /// Create the operator registry and its stake vault.
    ///
    /// The registry is a separate account rather than extra fields on `Pool`
    /// on purpose: the pool is already live on devnet holding policy counters
    /// and a funded vault, and growing a money-holding account in place is a
    /// migration, not a feature. Everything M3 adds is additive, so M2's
    /// tested paths keep working untouched while consensus is built beside
    /// them.
    pub fn initialize_registry(
        ctx: Context<InitializeRegistry>,
        threshold: u8,
        min_stake: u64,
    ) -> Result<()> {
        require!(threshold >= 1, CoverError::BadThreshold);

        let registry = &mut ctx.accounts.registry;
        registry.pool = ctx.accounts.pool.key();
        registry.authority = ctx.accounts.authority.key();
        registry.threshold = threshold;
        registry.min_stake = min_stake;
        registry.operator_count = 0;
        registry.bump = ctx.bumps.registry;
        registry.stake_vault_bump = ctx.bumps.stake_vault;
        Ok(())
    }

    /// Change how many agreeing attestations settle a claim (admin only).
    pub fn set_threshold(ctx: Context<SetThreshold>, threshold: u8) -> Result<()> {
        require!(threshold >= 1, CoverError::BadThreshold);
        ctx.accounts.registry.threshold = threshold;
        Ok(())
    }

    /// Join the operator set by staking SURETY.
    ///
    /// Registration is permissionless — that is the whole point of the
    /// milestone. What keeps it honest is the stake: it sits in a vault owned
    /// by the pool PDA, on the same terms as premiums, and week 3 makes it
    /// slashable when an operator's attestation disagrees with the outcome.
    pub fn register_operator(ctx: Context<RegisterOperator>, stake: u64) -> Result<()> {
        require!(
            stake >= ctx.accounts.registry.min_stake,
            CoverError::StakeBelowMinimum
        );

        let stake_base = to_base_units(stake, ctx.accounts.pool.decimals)?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.operator_token.to_account_info(),
                    to: ctx.accounts.stake_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            stake_base,
        )?;

        let operator = &mut ctx.accounts.operator;
        operator.pool = ctx.accounts.pool.key();
        operator.authority = ctx.accounts.authority.key();
        operator.stake = stake;
        operator.attestations = 0;
        operator.agreed = 0;
        operator.pending = 0;
        operator.active = true;
        operator.registered_at = Clock::get()?.unix_timestamp;
        operator.bump = ctx.bumps.operator;

        let registry = &mut ctx.accounts.registry;
        registry.operator_count = registry.operator_count.saturating_add(1);

        emit!(OperatorRegistered {
            operator: operator.key(),
            authority: operator.authority,
            stake,
        });
        Ok(())
    }

    /// Leave the operator set and take the stake back.
    ///
    /// Refused while the operator has attestations on claims that haven't
    /// settled yet — otherwise an operator could vote, see the verdict going
    /// against them, and withdraw before week 3's slashing could reach the
    /// stake.
    pub fn deregister_operator(ctx: Context<DeregisterOperator>) -> Result<()> {
        require!(
            ctx.accounts.operator.pending == 0,
            CoverError::OperatorHasPendingAttestations
        );

        let stake = ctx.accounts.operator.stake;
        if stake > 0 {
            let stake_base = to_base_units(stake, ctx.accounts.pool.decimals)?;
            let pool_bump = ctx.accounts.pool.bump;
            let seeds: &[&[u8]] = &[b"pool", core::slice::from_ref(&pool_bump)];
            token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    Transfer {
                        from: ctx.accounts.stake_vault.to_account_info(),
                        to: ctx.accounts.operator_token.to_account_info(),
                        authority: ctx.accounts.pool.to_account_info(),
                    },
                    &[seeds],
                ),
                stake_base,
            )?;
        }

        let registry = &mut ctx.accounts.registry;
        registry.operator_count = registry.operator_count.saturating_sub(1);

        emit!(OperatorDeregistered {
            authority: ctx.accounts.operator.authority,
            stake,
        });
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
        let premium_base = to_base_units(premium, ctx.accounts.pool.decimals)?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.holder_token.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.holder.to_account_info(),
                },
            ),
            premium_base,
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
    ///
    /// Also opens the claim's tally. Counting attestations there rather than on
    /// the Policy is deliberate: policies are already live on devnet at a fixed
    /// size, and adding fields to that account would leave every existing one
    /// unreadable. Nothing about M2's state layout moves.
    pub fn file_claim(ctx: Context<FileClaim>) -> Result<()> {
        let policy = &mut ctx.accounts.policy;
        require!(
            policy.status == PolicyStatus::Active,
            CoverError::NotClaimable
        );
        policy.status = PolicyStatus::Requested;

        let tally = &mut ctx.accounts.tally;
        tally.policy = policy.key();
        tally.approvals = 0;
        tally.denials = 0;
        tally.opened_at = Clock::get()?.unix_timestamp;
        tally.basis = String::new();
        tally.bump = ctx.bumps.tally;

        emit!(ClaimFiled {
            policy: policy.key(),
            holder: policy.holder,
        });
        Ok(())
    }

    /// Commit to a verdict without revealing it.
    ///
    /// The commitment is sha256(approved || salt || operator), so the chain
    /// stores 32 bytes that say nothing. This exists because the previous
    /// design let an operator wait, read what everyone else had said, and copy
    /// it — which produces the appearance of consensus while only one operator
    /// actually checked anything, and makes slashing unfair to whoever did the
    /// work.
    ///
    /// Copying somebody else's commitment is self-defeating: without their
    /// salt you can never reveal it, and an unrevealed commitment is slashed
    /// exactly like a wrong one.
    pub fn commit_attestation(
        ctx: Context<CommitAttestation>,
        commitment: [u8; 32],
    ) -> Result<()> {
        require!(
            ctx.accounts.policy.status == PolicyStatus::Requested
                || ctx.accounts.policy.status == PolicyStatus::Escalated,
            CoverError::NotSettleable
        );
        require!(ctx.accounts.operator.active, CoverError::OperatorInactive);
        require!(
            ctx.accounts.operator.stake >= ctx.accounts.registry.min_stake,
            CoverError::StakeBelowMinimum
        );

        let now = Clock::get()?.unix_timestamp;
        let closes = ctx
            .accounts
            .tally
            .opened_at
            .checked_add(ctx.accounts.params.commit_window)
            .ok_or(CoverError::MathOverflow)?;
        require!(now < closes, CoverError::CommitWindowClosed);

        let attestation = &mut ctx.accounts.attestation;
        attestation.policy = ctx.accounts.policy.key();
        attestation.operator = ctx.accounts.operator.key();
        attestation.commitment = commitment;
        attestation.approved = false;
        attestation.basis = String::new();
        attestation.revealed = false;
        attestation.resolved = false;
        attestation.created_at = now;
        attestation.bump = ctx.bumps.attestation;

        let operator = &mut ctx.accounts.operator;
        operator.attestations = operator.attestations.saturating_add(1);
        operator.pending = operator.pending.saturating_add(1);

        emit!(AttestationCommitted {
            policy: attestation.policy,
            operator: operator.authority,
        });
        Ok(())
    }

    /// Open the envelope. Only accepted once the commit window has closed —
    /// an early reveal would hand the answer to everyone still deciding, which
    /// is the leak the commit phase exists to prevent.
    pub fn reveal_attestation(
        ctx: Context<RevealAttestation>,
        approved: bool,
        basis: String,
        salt: [u8; 32],
    ) -> Result<()> {
        require!(basis.len() <= 64, CoverError::BasisTooLong);
        require!(!ctx.accounts.attestation.revealed, CoverError::AlreadyRevealed);

        let now = Clock::get()?.unix_timestamp;
        let opened = ctx.accounts.tally.opened_at;
        let commit_closes = opened
            .checked_add(ctx.accounts.params.commit_window)
            .ok_or(CoverError::MathOverflow)?;
        let reveal_closes = commit_closes
            .checked_add(ctx.accounts.params.reveal_window)
            .ok_or(CoverError::MathOverflow)?;
        require!(now >= commit_closes, CoverError::CommitWindowOpen);
        require!(now < reveal_closes, CoverError::RevealWindowClosed);

        // Recompute the commitment and insist it matches. The operator key is
        // in the preimage so a commitment cannot be lifted from one operator
        // and replayed by another.
        let mut preimage = Vec::with_capacity(1 + 32 + 32);
        preimage.push(approved as u8);
        preimage.extend_from_slice(&salt);
        preimage.extend_from_slice(ctx.accounts.operator.key().as_ref());
        let digest = solana_sha256_hasher::hash(&preimage);
        require!(
            digest.to_bytes() == ctx.accounts.attestation.commitment,
            CoverError::CommitmentMismatch
        );

        let attestation = &mut ctx.accounts.attestation;
        attestation.approved = approved;
        attestation.basis = basis.clone();
        attestation.revealed = true;

        let tally = &mut ctx.accounts.tally;
        if approved {
            tally.approvals = tally.approvals.saturating_add(1);
        } else {
            tally.denials = tally.denials.saturating_add(1);
        }
        tally.basis = basis.clone();

        emit!(AttestationRevealed {
            policy: attestation.policy,
            operator: ctx.accounts.operator.authority,
            approved,
            basis,
        });
        Ok(())
    }

    /// Settle a claim once enough operators agree.
    ///
    /// Deliberately permissionless: the signer pays the transaction fee and
    /// nothing else, and no key is checked against anything. Whether a claim
    /// pays is decided by counting attestations, not by whoever submits this.
    /// The payout destination is still fixed to the policy's own holder, which
    /// is the one property that has not moved since M2.
    pub fn settle_claim(ctx: Context<SettleClaim>) -> Result<()> {
        require!(
            ctx.accounts.policy.status == PolicyStatus::Requested
                || ctx.accounts.policy.status == PolicyStatus::Escalated,
            CoverError::NotSettleable
        );

        let threshold = ctx.accounts.registry.threshold;
        let approved = ctx.accounts.tally.approvals >= threshold;
        let denied = ctx.accounts.tally.denials >= threshold;
        require!(approved || denied, CoverError::ThresholdNotMet);

        if approved {
            let payout = to_base_units(ctx.accounts.policy.payout, ctx.accounts.pool.decimals)?;
            require!(
                ctx.accounts.vault.amount >= payout,
                CoverError::PoolUnderfunded
            );

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

        let basis = ctx.accounts.tally.basis.clone();
        let policy = &mut ctx.accounts.policy;
        policy.status = if approved {
            PolicyStatus::Paid
        } else {
            PolicyStatus::Denied
        };
        policy.settled_at = Clock::get()?.unix_timestamp;
        policy.basis = basis.clone();

        let amount = if approved { policy.payout } else { 0 };
        let policy_key = policy.key();
        let holder = policy.holder;

        let pool = &mut ctx.accounts.pool;
        if approved {
            pool.claims_paid = pool.claims_paid.saturating_add(1);
        } else {
            pool.claims_denied = pool.claims_denied.saturating_add(1);
        }

        emit!(ClaimSettled {
            policy: policy_key,
            holder,
            approved,
            amount,
            basis,
        });
        Ok(())
    }

    /* -------------------------------------------------------------- */
    /* M3 week 3: tunable parameters, slashing, stalled claims          */
    /* -------------------------------------------------------------- */

    /// Create the tunable parameter set.
    ///
    /// Separate from `Registry` because the registry is already live on devnet
    /// and appending fields to a deployed account leaves it undeserializable —
    /// the same reason the registry itself sits beside `Pool` rather than
    /// inside it. It is also the account operator governance will own later:
    /// keeping every knob in one place means handing over control is a change
    /// of authority, not a migration.
    pub fn initialize_params(
        ctx: Context<InitializeParams>,
        slash_bps: u16,
        dispute_window: i64,
        commit_window: i64,
        reveal_window: i64,
        reward_bps: u16,
    ) -> Result<()> {
        require!(slash_bps <= 10_000, CoverError::BadParameter);
        require!(reward_bps <= 10_000, CoverError::BadParameter);
        require!(dispute_window > 0, CoverError::BadParameter);

        let p = &mut ctx.accounts.params;
        p.reward_bps = reward_bps;
        p.pool = ctx.accounts.pool.key();
        p.authority = ctx.accounts.authority.key();
        p.slash_bps = slash_bps;
        p.dispute_window = dispute_window;
        p.commit_window = commit_window;
        p.reveal_window = reveal_window;
        p.bump = ctx.bumps.params;
        Ok(())
    }

    /// Retune the parameters. Admin today; operator vote later, which is why
    /// every number the protocol argues about lives here rather than as a
    /// constant in the binary.
    pub fn set_params(
        ctx: Context<SetParams>,
        slash_bps: u16,
        dispute_window: i64,
        commit_window: i64,
        reveal_window: i64,
        reward_bps: u16,
    ) -> Result<()> {
        require!(slash_bps <= 10_000, CoverError::BadParameter);
        require!(reward_bps <= 10_000, CoverError::BadParameter);
        require!(dispute_window > 0, CoverError::BadParameter);

        let p = &mut ctx.accounts.params;
        p.reward_bps = reward_bps;
        p.slash_bps = slash_bps;
        p.dispute_window = dispute_window;
        p.commit_window = commit_window;
        p.reveal_window = reveal_window;
        Ok(())
    }

    /// Grow the params account so a newly appended field fits.
    ///
    /// Params is already live, and a struct that gained a field is longer than
    /// the bytes on chain — every instruction that reads it would fail to
    /// deserialize, which is the whole program. The field is appended at the
    /// end, so the existing bytes stay exactly where they were and the new one
    /// lands in freshly zeroed space. Safe precisely because it is append-only:
    /// reordering or inserting a field could not be migrated this way.
    ///
    /// Deliberately does not touch any value. Set the new field afterwards with
    /// set_params, so a migration and a policy change are never the same
    /// transaction.
    pub fn migrate_params(ctx: Context<MigrateParams>) -> Result<()> {
        let info = ctx.accounts.params.to_account_info();
        let needed = 8 + Params::INIT_SPACE;
        let current = info.data_len();
        require!(current <= needed, CoverError::BadParameter);
        if current == needed {
            return Ok(());
        }

        let rent = Rent::get()?;
        let top_up = rent
            .minimum_balance(needed)
            .saturating_sub(info.lamports());
        if top_up > 0 {
            anchor_lang::system_program::transfer(
                CpiContext::new(
                    ctx.accounts.system_program.to_account_info(),
                    anchor_lang::system_program::Transfer {
                        from: ctx.accounts.authority.to_account_info(),
                        to: info.clone(),
                    },
                ),
                top_up,
            )?;
        }
        info.resize(needed)?;
        Ok(())
    }

    /// Top an operator back up after a slash.
    ///
    /// Without this a single wrong verdict is terminal: the slash drops an
    /// operator below the minimum, it goes inactive, and the only way back is
    /// to deregister and register again. Operators who cannot recover from one
    /// bad call are operators who leave.
    pub fn add_stake(ctx: Context<AddStake>, amount: u64) -> Result<()> {
        require!(amount > 0, CoverError::BadParameter);

        let base = to_base_units(amount, ctx.accounts.pool.decimals)?;
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.operator_token.to_account_info(),
                    to: ctx.accounts.stake_vault.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            base,
        )?;

        let min_stake = ctx.accounts.registry.min_stake;
        let operator = &mut ctx.accounts.operator;
        operator.stake = operator
            .stake
            .checked_add(amount)
            .ok_or(CoverError::MathOverflow)?;
        // Back above the floor, back in the rotation.
        if operator.stake >= min_stake {
            operator.active = true;
        }

        emit!(StakeAdded {
            authority: operator.authority,
            amount,
            stake: operator.stake,
        });
        Ok(())
    }

    /// Judge one attestation against the outcome the claim actually settled to,
    /// then credit or slash the operator who made it.
    ///
    /// Permissionless on purpose. If only the operator could call this, an
    /// operator who expects to be slashed would simply never call it — and
    /// their `pending` count would never clear, which is a lock, not a penalty.
    ///
    /// Worth being honest in the code about what this measures: the program
    /// cannot see the flight. It compares an attestation to the settled
    /// outcome, so this slashes *disagreement with the consensus*, not lying.
    /// An operator who is right while the majority is wrong is punished by
    /// this rule. Commit-reveal removes the incentive to copy, which is what
    /// makes the rule defensible; it does not make the rule omniscient.
    pub fn resolve_attestation(ctx: Context<ResolveAttestation>) -> Result<()> {
        require!(
            !ctx.accounts.attestation.resolved,
            CoverError::AlreadyResolved
        );
        // An attestation with no creation time is not one this program wrote.
        // Accounts created before commit-reveal are shorter than this struct,
        // so they deserialize into zeros rather than failing — and judging
        // those zeros would slash an operator over bytes that were never a
        // verdict. Rejecting them is cheaper than trusting a layout that
        // changed underneath them.
        require!(
            ctx.accounts.attestation.created_at > 0,
            CoverError::MalformedAttestation
        );

        let settled_paid = ctx.accounts.policy.status == PolicyStatus::Paid;
        let settled_denied = ctx.accounts.policy.status == PolicyStatus::Denied;
        require!(settled_paid || settled_denied, CoverError::NotSettled);

        // A sealed verdict that was never opened is not a verdict. It counts
        // as a no-show and is slashed like a wrong answer — otherwise the
        // cheapest strategy is to commit noise and stay silent, which costs
        // nothing and still occupies a slot in the operator set.
        let agreed = if ctx.accounts.attestation.revealed {
            ctx.accounts.attestation.approved == settled_paid
        } else {
            let now = Clock::get()?.unix_timestamp;
            let reveal_closes = ctx
                .accounts
                .tally
                .opened_at
                .checked_add(ctx.accounts.params.commit_window)
                .and_then(|t| t.checked_add(ctx.accounts.params.reveal_window))
                .ok_or(CoverError::MathOverflow)?;
            require!(now >= reveal_closes, CoverError::RevealWindowOpen);
            false
        };

        let mut slashed: u64 = 0;
        if !agreed {
            let stake = ctx.accounts.operator.stake;
            let bps = ctx.accounts.params.slash_bps as u64;
            slashed = stake
                .checked_mul(bps)
                .ok_or(CoverError::MathOverflow)?
                / BPS_DENOM;

            if slashed > 0 {
                // Slashed stake goes to the payout vault, so it backs future
                // claims. Deliberately not shared out among the agreeing
                // operators: that would pay a majority to gang up on a
                // minority, which is the failure mode this is meant to avoid.
                let base = to_base_units(slashed, ctx.accounts.pool.decimals)?;
                let pool_bump = ctx.accounts.pool.bump;
                let seeds: &[&[u8]] = &[b"pool", core::slice::from_ref(&pool_bump)];
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.stake_vault.to_account_info(),
                            to: ctx.accounts.vault.to_account_info(),
                            authority: ctx.accounts.pool.to_account_info(),
                        },
                        &[seeds],
                    ),
                    base,
                )?;
            }
        }

        // Pay the operator for work it got right.
        //
        // Slashing alone is not an incentive system: it only punishes. Nobody
        // rational stakes capital, runs infrastructure and takes slashing risk
        // for nothing, so without this the operator set can only ever be
        // people who own the protocol.
        //
        // The budget is a share of the premium the holder already paid, split
        // across the registered set — reward_bps of the premium divided by
        // operator_count. Dividing by the set size is what bounds it: however
        // many operators verify a claim, the total paid out cannot exceed that
        // share of its premium. A per-operator flat fee could quietly outrun
        // the premium as the set grows.
        let mut rewarded: u64 = 0;
        if agreed {
            let count = ctx.accounts.registry.operator_count.max(1) as u64;
            let budget = ctx
                .accounts
                .policy
                .premium
                .checked_mul(ctx.accounts.params.reward_bps as u64)
                .ok_or(CoverError::MathOverflow)?
                / BPS_DENOM;
            rewarded = budget / count;

            let base = to_base_units(rewarded, ctx.accounts.pool.decimals)?;
            // Never pay a reward out of money owed to policyholders. If the
            // vault is thin the verdict still stands; the reward is skipped.
            if base > 0 && ctx.accounts.vault.amount >= base {
                let pool_bump = ctx.accounts.pool.bump;
                let seeds: &[&[u8]] = &[b"pool", core::slice::from_ref(&pool_bump)];
                token::transfer(
                    CpiContext::new_with_signer(
                        ctx.accounts.token_program.to_account_info(),
                        Transfer {
                            from: ctx.accounts.vault.to_account_info(),
                            to: ctx.accounts.operator_token.to_account_info(),
                            authority: ctx.accounts.pool.to_account_info(),
                        },
                        &[seeds],
                    ),
                    base,
                )?;
            } else {
                rewarded = 0;
            }
        }

        let min_stake = ctx.accounts.registry.min_stake;
        let operator = &mut ctx.accounts.operator;
        if agreed {
            operator.agreed = operator.agreed.saturating_add(1);
        } else {
            operator.stake = operator.stake.saturating_sub(slashed);
            // Below the minimum an operator stops counting toward any
            // threshold. It can top back up; it cannot keep voting on credit.
            if operator.stake < min_stake {
                operator.active = false;
            }
        }
        operator.pending = operator.pending.saturating_sub(1);

        let attestation = &mut ctx.accounts.attestation;
        attestation.resolved = true;

        emit!(AttestationResolved {
            policy: attestation.policy,
            operator: operator.authority,
            agreed,
            slashed,
            rewarded,
        });
        Ok(())
    }

    /// Escalate a claim that nobody finished assessing.
    ///
    /// Permissionless once the dispute window has passed. Without this a claim
    /// that never reaches the threshold sits `Requested` forever and the
    /// holder has no path at all — the worst outcome the protocol can produce,
    /// and one no operator has any incentive to fix.
    pub fn escalate_stalled_claim(ctx: Context<EscalateStalled>) -> Result<()> {
        require!(
            ctx.accounts.policy.status == PolicyStatus::Requested,
            CoverError::NotSettleable
        );

        let now = Clock::get()?.unix_timestamp;
        let deadline = ctx
            .accounts
            .tally
            .opened_at
            .checked_add(ctx.accounts.params.dispute_window)
            .ok_or(CoverError::MathOverflow)?;
        require!(now >= deadline, CoverError::DisputeWindowOpen);

        let threshold = ctx.accounts.registry.threshold;
        require!(
            ctx.accounts.tally.approvals < threshold && ctx.accounts.tally.denials < threshold,
            CoverError::ThresholdMet
        );

        let policy = &mut ctx.accounts.policy;
        policy.status = PolicyStatus::Escalated;
        policy.basis = String::from("no quorum before deadline");

        emit!(ClaimEscalated {
            policy: policy.key(),
            reason: String::from("no quorum before deadline"),
        });
        Ok(())
    }

    /// The data was inconclusive: hand the claim to human verification rather
    /// than guessing. It stays settleable afterwards.
    pub fn escalate_claim(ctx: Context<EscalateClaim>, reason: String) -> Result<()> {
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
    /// Decimals of `mint`, so whole-token amounts can be converted to base
    /// units without hardcoding a value that only holds for SURETY.
    pub decimals: u8,
    pub policies: u64,
    pub claims_paid: u64,
    pub claims_denied: u64,
    pub bump: u8,
    pub vault_bump: u8,
}

/// Every number the protocol argues about, in one account.
///
/// Admin-controlled today, operator-voted later — which is the whole reason
/// these are account fields rather than constants in the binary.
#[account]
#[derive(InitSpace)]
pub struct Params {
    pub pool: Pubkey,
    pub authority: Pubkey,
    /// Basis points of an operator's stake taken for a wrong verdict.
    pub slash_bps: u16,
    /// Seconds a claim may sit without quorum before anyone can escalate it.
    pub dispute_window: i64,
    /// Commit-reveal windows, in seconds.
    pub commit_window: i64,
    pub reveal_window: i64,
    pub bump: u8,
    /// Share of each premium set aside to pay the operators who verified the
    /// claim, in basis points. Appended after Params was already live, which
    /// is why migrate_params exists — see the note there before adding more.
    pub reward_bps: u16,
}

/// Running count of a single claim's attestations.
///
/// Separate from `Policy` because policies are already live on devnet at a
/// fixed size — appending fields there would leave every existing one
/// undeserializable.
#[account]
#[derive(InitSpace)]
pub struct ClaimTally {
    pub policy: Pubkey,
    pub approvals: u8,
    pub denials: u8,
    /// When the claim was filed — week 3 measures the dispute window from here.
    pub opened_at: i64,
    /// The most recently recorded reason, shown to the holder as evidence.
    #[max_len(64)]
    pub basis: String,
    pub bump: u8,
}

/// One operator's signed verdict on one claim.
///
/// Kept after settlement rather than closed: week 3 compares it against the
/// outcome to decide whether that operator is credited or slashed.
#[account]
#[derive(InitSpace)]
pub struct Attestation {
    pub policy: Pubkey,
    pub operator: Pubkey,
    /// sha256(approved || salt || operator). Says nothing until revealed.
    pub commitment: [u8; 32],
    /// Meaningless until `revealed` is true.
    pub approved: bool,
    #[max_len(64)]
    pub basis: String,
    pub created_at: i64,
    pub revealed: bool,
    /// Set once the verdict has been judged, so stake cannot be double-counted.
    pub resolved: bool,
    pub bump: u8,
}

/// Consensus configuration and the operator roll-call.
///
/// Deliberately separate from `Pool` — see `initialize_registry`.
#[account]
#[derive(InitSpace)]
pub struct Registry {
    pub pool: Pubkey,
    pub authority: Pubkey,
    /// Agreeing attestations required to settle a claim.
    pub threshold: u8,
    /// Whole tokens an operator must stake to join.
    pub min_stake: u64,
    pub operator_count: u16,
    pub bump: u8,
    pub stake_vault_bump: u8,
}

/// One registered claim verifier.
///
/// `attestations` / `agreed` are a public track record: an operator that keeps
/// disagreeing with settled outcomes is visible before it is ever slashed.
#[account]
#[derive(InitSpace)]
pub struct Operator {
    pub pool: Pubkey,
    pub authority: Pubkey,
    /// Whole tokens, like payouts and premiums everywhere else.
    pub stake: u64,
    pub attestations: u64,
    pub agreed: u64,
    /// Attestations on claims that haven't settled yet. Blocks withdrawal.
    pub pending: u32,
    pub active: bool,
    pub registered_at: i64,
    pub bump: u8,
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
pub struct InitializeRegistry<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump, has_one = authority)]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = authority,
        space = 8 + Registry::INIT_SPACE,
        seeds = [b"registry", pool.key().as_ref()],
        bump
    )]
    pub registry: Account<'info, Registry>,

    /// Stake sits under the same PDA authority as premiums do.
    #[account(
        init,
        payer = authority,
        seeds = [b"stake_vault", pool.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = pool,
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(constraint = mint.key() == pool.mint @ CoverError::WrongMint)]
    pub mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct SetThreshold<'info> {
    #[account(
        mut,
        seeds = [b"registry", registry.pool.as_ref()],
        bump = registry.bump,
        has_one = authority
    )]
    pub registry: Account<'info, Registry>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct RegisterOperator<'info> {
    /// Anyone may register — the stake is the gate, not a permission list.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"registry", pool.key().as_ref()],
        bump = registry.bump
    )]
    pub registry: Account<'info, Registry>,

    /// One per authority, enforced by the seeds: registering twice fails
    /// because the account already exists, not because of a check we wrote.
    #[account(
        init,
        payer = authority,
        space = 8 + Operator::INIT_SPACE,
        seeds = [b"operator", pool.key().as_ref(), authority.key().as_ref()],
        bump
    )]
    pub operator: Account<'info, Operator>,

    #[account(
        mut,
        seeds = [b"stake_vault", pool.key().as_ref()],
        bump = registry.stake_vault_bump
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = operator_token.owner == authority.key() @ CoverError::WrongTokenOwner,
        constraint = operator_token.mint == pool.mint @ CoverError::WrongMint
    )]
    pub operator_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct DeregisterOperator<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"registry", pool.key().as_ref()],
        bump = registry.bump
    )]
    pub registry: Account<'info, Registry>,

    /// `has_one` means only the operator's own key can withdraw its stake —
    /// the pool admin cannot deregister someone else and take it.
    #[account(
        mut,
        close = authority,
        seeds = [b"operator", pool.key().as_ref(), authority.key().as_ref()],
        bump = operator.bump,
        has_one = authority @ CoverError::NotOperator
    )]
    pub operator: Account<'info, Operator>,

    #[account(
        mut,
        seeds = [b"stake_vault", pool.key().as_ref()],
        bump = registry.stake_vault_bump
    )]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = operator_token.owner == authority.key() @ CoverError::WrongTokenOwner,
        constraint = operator_token.mint == pool.mint @ CoverError::WrongMint
    )]
    pub operator_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
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
    #[account(mut)]
    pub holder: Signer<'info>,

    #[account(
        mut,
        seeds = [b"policy", holder.key().as_ref(), &policy.nonce.to_le_bytes()],
        bump = policy.bump,
        has_one = holder @ CoverError::NotPolicyHolder
    )]
    pub policy: Account<'info, Policy>,

    /// Opened here so attesting never has to create it, which keeps the
    /// operator's instruction a pure vote.
    #[account(
        init,
        payer = holder,
        space = 8 + ClaimTally::INIT_SPACE,
        seeds = [b"tally", policy.key().as_ref()],
        bump
    )]
    pub tally: Account<'info, ClaimTally>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CommitAttestation<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(seeds = [b"registry", pool.key().as_ref()], bump = registry.bump)]
    pub registry: Account<'info, Registry>,

    #[account(seeds = [b"params", pool.key().as_ref()], bump = params.bump)]
    pub params: Account<'info, Params>,

    /// Seeds bind this to the signer: an operator can only ever commit as
    /// itself.
    #[account(
        mut,
        seeds = [b"operator", pool.key().as_ref(), authority.key().as_ref()],
        bump = operator.bump,
        has_one = authority @ CoverError::NotOperator
    )]
    pub operator: Account<'info, Operator>,

    #[account(
        seeds = [b"policy", policy.holder.as_ref(), &policy.nonce.to_le_bytes()],
        bump = policy.bump
    )]
    pub policy: Account<'info, Policy>,

    #[account(seeds = [b"tally", policy.key().as_ref()], bump = tally.bump)]
    pub tally: Account<'info, ClaimTally>,

    /// One per (policy, operator). Committing twice collides with an account
    /// that already exists, before any of our logic runs.
    #[account(
        init,
        payer = authority,
        space = 8 + Attestation::INIT_SPACE,
        seeds = [b"attest", policy.key().as_ref(), operator.key().as_ref()],
        bump
    )]
    pub attestation: Account<'info, Attestation>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealAttestation<'info> {
    pub authority: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(seeds = [b"params", pool.key().as_ref()], bump = params.bump)]
    pub params: Account<'info, Params>,

    #[account(
        seeds = [b"operator", pool.key().as_ref(), authority.key().as_ref()],
        bump = operator.bump,
        has_one = authority @ CoverError::NotOperator
    )]
    pub operator: Account<'info, Operator>,

    #[account(
        seeds = [b"policy", policy.holder.as_ref(), &policy.nonce.to_le_bytes()],
        bump = policy.bump
    )]
    pub policy: Account<'info, Policy>,

    #[account(mut, seeds = [b"tally", policy.key().as_ref()], bump = tally.bump)]
    pub tally: Account<'info, ClaimTally>,

    #[account(
        mut,
        seeds = [b"attest", policy.key().as_ref(), operator.key().as_ref()],
        bump = attestation.bump
    )]
    pub attestation: Account<'info, Attestation>,
}

#[derive(Accounts)]
pub struct SettleClaim<'info> {
    /// Pays the fee. Nothing is checked about this key — that is the point of
    /// the milestone. Settlement is decided by the tally, not the signer.
    pub cranker: Signer<'info>,

    #[account(mut, seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        seeds = [b"registry", pool.key().as_ref()],
        bump = registry.bump
    )]
    pub registry: Account<'info, Registry>,

    #[account(
        mut,
        seeds = [b"policy", policy.holder.as_ref(), &policy.nonce.to_le_bytes()],
        bump = policy.bump
    )]
    pub policy: Account<'info, Policy>,

    #[account(
        seeds = [b"tally", policy.key().as_ref()],
        bump = tally.bump
    )]
    pub tally: Account<'info, ClaimTally>,

    #[account(
        mut,
        seeds = [b"vault", pool.key().as_ref()],
        bump = pool.vault_bump
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Must belong to the policy holder. Unchanged from M2, and the reason a
    /// wrong verdict still cannot become a redirected payout.
    #[account(
        mut,
        constraint = holder_token.owner == policy.holder @ CoverError::WrongTokenOwner,
        constraint = holder_token.mint == pool.mint @ CoverError::WrongMint
    )]
    pub holder_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

/// Escalation stays an oracle action for now. It cannot pay anyone — it only
/// routes a claim to human verification — and week 3 replaces it with a
/// deadline anyone can trigger.
#[derive(Accounts)]
pub struct EscalateClaim<'info> {
    #[account(constraint = oracle.key() == pool.oracle @ CoverError::NotOracle)]
    pub oracle: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(
        mut,
        seeds = [b"policy", policy.holder.as_ref(), &policy.nonce.to_le_bytes()],
        bump = policy.bump
    )]
    pub policy: Account<'info, Policy>,
}

#[derive(Accounts)]
pub struct InitializeParams<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump, has_one = authority)]
    pub pool: Account<'info, Pool>,

    #[account(
        init,
        payer = authority,
        space = 8 + Params::INIT_SPACE,
        seeds = [b"params", pool.key().as_ref()],
        bump
    )]
    pub params: Account<'info, Params>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SetParams<'info> {
    #[account(
        mut,
        seeds = [b"params", params.pool.as_ref()],
        bump = params.bump,
        has_one = authority
    )]
    pub params: Account<'info, Params>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ResolveAttestation<'info> {
    /// Pays the fee. Checked against nothing — anyone may resolve, which is
    /// what stops an operator avoiding a slash by never calling this.
    pub cranker: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(seeds = [b"registry", pool.key().as_ref()], bump = registry.bump)]
    pub registry: Account<'info, Registry>,

    #[account(seeds = [b"params", pool.key().as_ref()], bump = params.bump)]
    pub params: Account<'info, Params>,

    #[account(
        seeds = [b"policy", policy.holder.as_ref(), &policy.nonce.to_le_bytes()],
        bump = policy.bump
    )]
    pub policy: Account<'info, Policy>,

    #[account(seeds = [b"tally", policy.key().as_ref()], bump = tally.bump)]
    pub tally: Account<'info, ClaimTally>,

    #[account(
        mut,
        seeds = [b"attest", policy.key().as_ref(), operator.key().as_ref()],
        bump = attestation.bump
    )]
    pub attestation: Account<'info, Attestation>,

    #[account(
        mut,
        seeds = [b"operator", pool.key().as_ref(), operator.authority.as_ref()],
        bump = operator.bump
    )]
    pub operator: Account<'info, Operator>,

    #[account(mut, seeds = [b"stake_vault", pool.key().as_ref()], bump = registry.stake_vault_bump)]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(mut, seeds = [b"vault", pool.key().as_ref()], bump = pool.vault_bump)]
    pub vault: Account<'info, TokenAccount>,

    /// Where a correct operator is paid. Constrained to that operator, so a
    /// cranker cannot redirect the reward to itself — the same rule the payout
    /// destination has always followed.
    #[account(
        mut,
        constraint = operator_token.owner == operator.authority @ CoverError::WrongTokenOwner,
        constraint = operator_token.mint == pool.mint @ CoverError::WrongMint
    )]
    pub operator_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct EscalateStalled<'info> {
    /// Anyone. A stalled claim is everyone's problem and nobody's job.
    pub cranker: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(seeds = [b"registry", pool.key().as_ref()], bump = registry.bump)]
    pub registry: Account<'info, Registry>,

    #[account(seeds = [b"params", pool.key().as_ref()], bump = params.bump)]
    pub params: Account<'info, Params>,

    #[account(
        mut,
        seeds = [b"policy", policy.holder.as_ref(), &policy.nonce.to_le_bytes()],
        bump = policy.bump
    )]
    pub policy: Account<'info, Policy>,

    #[account(seeds = [b"tally", policy.key().as_ref()], bump = tally.bump)]
    pub tally: Account<'info, ClaimTally>,
}

#[derive(Accounts)]
pub struct MigrateParams<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump, has_one = authority)]
    pub pool: Account<'info, Pool>,

    /// CHECK: deliberately unchecked. The account is too short to deserialize
    /// as `Params` until it has been resized, which is the entire point of this
    /// instruction. Its identity is proven by the seeds.
    #[account(mut, seeds = [b"params", pool.key().as_ref()], bump)]
    pub params: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AddStake<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(seeds = [b"pool"], bump = pool.bump)]
    pub pool: Account<'info, Pool>,

    #[account(seeds = [b"registry", pool.key().as_ref()], bump = registry.bump)]
    pub registry: Account<'info, Registry>,

    /// Seeds bind this to the signer: you can only top up your own stake.
    #[account(
        mut,
        seeds = [b"operator", pool.key().as_ref(), authority.key().as_ref()],
        bump = operator.bump,
        has_one = authority @ CoverError::NotOperator
    )]
    pub operator: Account<'info, Operator>,

    #[account(mut, seeds = [b"stake_vault", pool.key().as_ref()], bump = registry.stake_vault_bump)]
    pub stake_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = operator_token.owner == authority.key() @ CoverError::WrongTokenOwner,
        constraint = operator_token.mint == pool.mint @ CoverError::WrongMint
    )]
    pub operator_token: Account<'info, TokenAccount>,

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

#[event]
pub struct AttestationCommitted {
    pub policy: Pubkey,
    pub operator: Pubkey,
}

#[event]
pub struct AttestationRevealed {
    pub policy: Pubkey,
    pub operator: Pubkey,
    pub approved: bool,
    pub basis: String,
}

#[event]
pub struct StakeAdded {
    pub authority: Pubkey,
    pub amount: u64,
    pub stake: u64,
}

#[event]
pub struct AttestationResolved {
    pub policy: Pubkey,
    pub operator: Pubkey,
    pub agreed: bool,
    pub slashed: u64,
    pub rewarded: u64,
}

#[event]
pub struct OperatorRegistered {
    pub operator: Pubkey,
    pub authority: Pubkey,
    pub stake: u64,
}

#[event]
pub struct OperatorDeregistered {
    pub authority: Pubkey,
    pub stake: u64,
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
    #[msg("Threshold must be at least 1")]
    BadThreshold,
    #[msg("Stake is below the registry minimum")]
    StakeBelowMinimum,
    #[msg("Operator still has attestations on unsettled claims")]
    OperatorHasPendingAttestations,
    #[msg("Signer is not this operator")]
    NotOperator,
    #[msg("Not enough operators have agreed to settle this claim")]
    ThresholdNotMet,
    #[msg("Operator is not active")]
    OperatorInactive,
    #[msg("Parameter is outside the permitted range")]
    BadParameter,
    #[msg("This attestation has already been judged")]
    AlreadyResolved,
    #[msg("The claim has not settled yet")]
    NotSettled,
    #[msg("The dispute window has not closed")]
    DisputeWindowOpen,
    #[msg("The threshold was met; settle it instead of escalating")]
    ThresholdMet,
    #[msg("The commit window has closed")]
    CommitWindowClosed,
    #[msg("The commit window is still open")]
    CommitWindowOpen,
    #[msg("The reveal window has closed")]
    RevealWindowClosed,
    #[msg("This attestation was already revealed")]
    AlreadyRevealed,
    #[msg("Revealed verdict does not match the commitment")]
    CommitmentMismatch,
    #[msg("The reveal window is still open")]
    RevealWindowOpen,
    #[msg("This attestation predates the current account layout")]
    MalformedAttestation,
}
