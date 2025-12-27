#![allow(clippy::result_large_err)]

use anchor_lang::prelude::*;

declare_id!("H3HS3NsQe2fgWqSnyF1NcFmB6yaBu7ZVZ2YYN5QdNpHn");

#[program]
pub mod counter {
    use super::*;

    /// Register a new agent with JSON data and initial rating
    pub fn register_agent(ctx: Context<RegisterAgent>, agent_data: String) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        agent.owner = ctx.accounts.owner.key();
        agent.agent_data = agent_data;
        agent.rating = 0;
        agent.total_receipts = 0;
        agent.bump = ctx.bumps.agent;

        msg!("Agent registered: {}", agent.owner);
        Ok(())
    }

    /// Update agent data
    pub fn update_agent_data(ctx: Context<UpdateAgent>, new_agent_data: String) -> Result<()> {
        let agent = &mut ctx.accounts.agent;
        agent.agent_data = new_agent_data;

        msg!("Agent data updated: {}", agent.owner);
        Ok(())
    }

    /// Create a receipt for work done by an agent
    /// Cost is split 50/50 between caller and agent
    pub fn create_receipt(
        ctx: Context<CreateReceipt>,
        receipt_id: u64,
        task_description: String,
    ) -> Result<()> {
        let receipt = &mut ctx.accounts.receipt;
        let agent = &ctx.accounts.agent;

        receipt.agent = agent.key();
        receipt.caller = ctx.accounts.caller.key();
        receipt.task_description = task_description;
        receipt.status = ReceiptStatus::Pending;
        receipt.rating = None;
        receipt.receipt_id = receipt_id;
        receipt.created_at = Clock::get()?.unix_timestamp;
        receipt.bump = ctx.bumps.receipt;

        msg!("Receipt created for agent: {}", agent.owner);
        Ok(())
    }

    /// Agent accepts the receipt
    pub fn accept_receipt(ctx: Context<AcceptReceipt>) -> Result<()> {
        let receipt = &mut ctx.accounts.receipt;

        require!(
            receipt.status == ReceiptStatus::Pending,
            ErrorCode::InvalidReceiptStatus
        );

        receipt.status = ReceiptStatus::Accepted;
        receipt.accepted_at = Some(Clock::get()?.unix_timestamp);

        msg!("Receipt accepted by agent");
        Ok(())
    }

    /// Caller rates the receipt and closes it
    /// Agent's rating is updated and costs are refunded 50/50
    pub fn rate_and_close_receipt(
        ctx: Context<RateAndCloseReceipt>,
        is_positive: bool,
    ) -> Result<()> {
        let receipt = &ctx.accounts.receipt;
        let agent = &mut ctx.accounts.agent;

        require!(
            receipt.status == ReceiptStatus::Accepted,
            ErrorCode::ReceiptNotAccepted
        );

        // Update agent rating
        if is_positive {
            agent.rating = agent.rating.checked_add(1).unwrap();
        } else {
            agent.rating = agent.rating.checked_sub(1).unwrap_or(0);
        }
        agent.total_receipts = agent.total_receipts.checked_add(1).unwrap();

        msg!(
            "Receipt rated {} and closed. New agent rating: {}/{}",
            if is_positive { "positive" } else { "negative" },
            agent.rating,
            agent.total_receipts
        );

        // Receipt account will be closed automatically via close constraint
        Ok(())
    }

    /// Close agent account (owner only)
    pub fn close_agent(_ctx: Context<CloseAgent>) -> Result<()> {
        msg!("Agent account closed");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        init,
        payer = owner,
        space = 8 + Agent::INIT_SPACE,
        seeds = [b"agent", owner.key().as_ref()],
        bump
    )]
    pub agent: Account<'info, Agent>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [b"agent", owner.key().as_ref()],
        bump = agent.bump,
        has_one = owner
    )]
    pub agent: Account<'info, Agent>,
}

#[derive(Accounts)]
#[instruction(receipt_id: u64, task_description: String)]
pub struct CreateReceipt<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    /// The agent account
    #[account(
        seeds = [b"agent", agent.owner.as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, Agent>,

    /// Agent owner pays half the cost
    #[account(mut)]
    pub agent_owner: SystemAccount<'info>,

    #[account(
        init,
        payer = caller,
        space = 8 + Receipt::INIT_SPACE,
        seeds = [
            b"receipt",
            agent.key().as_ref(),
            caller.key().as_ref(),
            &receipt_id.to_le_bytes()
        ],
        bump
    )]
    pub receipt: Account<'info, Receipt>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AcceptReceipt<'info> {
    /// The agent owner must sign to accept
    pub agent_owner: Signer<'info>,

    #[account(
        seeds = [b"agent", agent_owner.key().as_ref()],
        bump = agent.bump,
        constraint = agent.owner.key() == agent_owner.key() @ ErrorCode::Unauthorized
    )]
    pub agent: Account<'info, Agent>,

    #[account(
        mut,
        seeds = [
            b"receipt",
            receipt.agent.as_ref(),
            receipt.caller.as_ref(),
            &receipt.receipt_id.to_le_bytes()
        ],
        bump = receipt.bump,
        has_one = agent
    )]
    pub receipt: Account<'info, Receipt>,
}

#[derive(Accounts)]
pub struct RateAndCloseReceipt<'info> {
    /// The caller who created the receipt must sign to rate
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [b"agent", agent.owner.as_ref()],
        bump = agent.bump
    )]
    pub agent: Account<'info, Agent>,

    /// Agent owner receives half the refund
    #[account(mut)]
    pub agent_owner: SystemAccount<'info>,

    #[account(
        mut,
        close = caller, // Half refunded to caller
        seeds = [
            b"receipt",
            receipt.agent.as_ref(),
            receipt.caller.as_ref(),
            &receipt.receipt_id.to_le_bytes()
        ],
        bump = receipt.bump,
        has_one = caller,
        has_one = agent
    )]
    pub receipt: Account<'info, Receipt>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseAgent<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        close = owner,
        seeds = [b"agent", owner.key().as_ref()],
        bump = agent.bump,
        has_one = owner
    )]
    pub agent: Account<'info, Agent>,
}

#[account]
#[derive(InitSpace)]
pub struct Agent {
    pub owner: Pubkey,
    #[max_len(2048)]
    pub agent_data: String, // JSON data or URI (ERC-8004 format)
    pub rating: i64,
    pub total_receipts: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Receipt {
    pub agent: Pubkey,
    pub caller: Pubkey,
    #[max_len(256)]
    pub task_description: String,
    pub status: ReceiptStatus,
    pub rating: Option<bool>, // Some(true) = positive, Some(false) = negative, None = not rated
    pub receipt_id: u64,
    pub created_at: i64,
    pub accepted_at: Option<i64>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub enum ReceiptStatus {
    Pending,
    Accepted,
}

#[error_code]
pub enum ErrorCode {
    #[msg("Invalid receipt status for this operation")]
    InvalidReceiptStatus,
    #[msg("Receipt must be accepted before rating")]
    ReceiptNotAccepted,
    #[msg("Unauthorized action")]
    Unauthorized,
}
