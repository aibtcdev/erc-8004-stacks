# ERC-8004 for Solana: Agent Registry & Receipt System

An on-chain agent registry and reputation system for Solana, inspired by ERC-8004. This project implements a decentralized way to register AI agents, create receipts for work performed, and build reputation through an escrow-based rating system.

## Features

### 🤖 Agent Registry

- **ERC-8004 Compliant**: Full support for the ERC-8004 agent registration standard
- **On-chain Agent Profiles**: Register AI agents with structured JSON metadata including endpoints, registrations, and trust mechanisms
- **PDA-based Accounts**: Each agent is stored in a Program Derived Address (PDA) associated with the owner's wallet
- **Updatable Metadata**: Agent owners can update their agent's information at any time
- **Persistent Reputation**: On-chain rating system tracks agent performance
- **Protocol Interoperability**: Support for A2A, MCP, OASF, ENS, DID, and wallet endpoints

### 📝 Receipt System

- **Work Verification**: Create on-chain receipts when agents complete tasks
- **Cost Sharing Escrow**: Receipt creation costs are split 50/50 between caller and agent
- **Agent Acceptance**: Agents must accept receipts before they can be rated
- **Automatic Refunds**: Upon rating completion, costs are refunded 50/50

### ⭐ Reputation Management

- **Positive/Negative Ratings**: Callers can rate agent performance
- **On-chain Score**: Ratings are permanently recorded and displayed (e.g., 5/10 = 5 positive out of 10 total)
- **Trust Building**: Public reputation helps users choose reliable agents

## Architecture

### Smart Contract (Anchor Program)

#### Accounts

- **Agent**: Stores agent metadata, rating, total receipts, and bump seed
- **Receipt**: Tracks task details, status (Pending/Accepted), timestamps, and rating

#### Instructions

1. `register_agent`: Create a new agent profile
2. `update_agent_data`: Modify agent metadata (owner only)
3. `create_receipt`: Create a receipt for work done by an agent
4. `accept_receipt`: Agent accepts the receipt
5. `rate_and_close_receipt`: Caller rates work and closes receipt (refunds split 50/50)
6. `close_agent`: Delete agent profile (owner only)

### Web Application

Built with Next.js 15, React, and TailwindCSS:

- **Home Page**: Overview of the system with feature cards
- **Agents Page**: Browse all registered agents, register new agents, create receipts
- **Receipts Page**: View receipts as agent or caller, accept receipts, rate work

## Getting Started

### Prerequisites

- Node.js 18+ and npm/yarn
- Rust and Solana CLI
- Anchor Framework 0.31.1

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/s8004.git
cd s8004
```

2. Install dependencies:

```bash
npm install
```

3. Build the Anchor program:

In one terminal

```bash
solana-test-validator
```

In another terminal

```bash
cd anchor
anchor build
anchor keys sync
anchor build && anchor deploy
```

4. Run tests:

```bash
anchor test
```

5. Start the development server:

```bash
cd ..
npm run dev
```

Now you can test out the receipts flow in the browser at http://localhost:3000

## Usage

### Registering an Agent

1. Connect your wallet
2. Navigate to the "Agents" page
3. Choose registration method:
   - **📋 Load Preset Template** - Start with ERC-8004 compliant example
   - **✏️ Create Custom JSON** - Write your own registration data
4. Edit the JSON with your agent's details:
   - Name, description, and image
   - Endpoints (A2A, MCP, OASF, etc.)
   - Registrations (on-chain identities)
   - Supported trust mechanisms
5. Click "Register Agent"

See [ERC8004_FORMAT.md](./ERC8004_FORMAT.md) for detailed format specification.

### Creating a Receipt

1. Find an agent on the "Agents" page
2. Enter the task description
3. Click "Create Receipt"
4. Cost is split 50/50 with the agent

### Agent Workflow

1. **As an Agent**:
   - View receipts created for your agent
   - Accept receipts for work you've completed
   - Build your reputation

2. **As a Caller**:
   - Create receipts when agents complete work
   - Rate receipts positively or negatively
   - Costs are refunded when you rate

## Testing

The project includes comprehensive tests covering:

- Agent registration and updates
- Receipt creation and acceptance
- Rating system and escrow refunds
- Access control and error handling

Run tests:

```bash
cd anchor
anchor test
```

## Program Structure

```
anchor/programs/counter/src/lib.rs
├── Instructions
│   ├── register_agent
│   ├── update_agent_data
│   ├── create_receipt
│   ├── accept_receipt
│   ├── rate_and_close_receipt
│   └── close_agent
├── Accounts
│   ├── RegisterAgent
│   ├── UpdateAgent
│   ├── CreateReceipt
│   ├── AcceptReceipt
│   ├── RateAndCloseReceipt
│   └── CloseAgent
└── Data Structures
    ├── Agent
    ├── Receipt
    ├── ReceiptStatus
    └── ErrorCode
```

## Web App Structure

```
src/
├── app/
│   ├── agents/page.tsx          # Agent registry page
│   ├── receipts/page.tsx        # Receipts management page
│   └── layout.tsx               # Navigation and layout
└── components/
    ├── agent/
    │   ├── agent-data-access.tsx  # React Query hooks
    │   ├── agent-ui.tsx           # UI components
    │   └── agent-feature.tsx      # Feature components
    └── dashboard/
        └── dashboard-feature.tsx  # Home page
```

## Security Considerations

- **PDA-based Accounts**: All accounts use Program Derived Addresses for security
- **Owner Validation**: Only agent owners can update or close their agents
- **Caller Validation**: Only receipt callers can rate receipts
- **Status Checks**: Receipts must be accepted before rating
- **Automatic Cleanup**: Receipts are closed after rating, preventing double-rating

## Future Enhancements

To mitigate agents voting positive for them selfs one could add a receipt accept fee and also a negative rating fee.
These fees could then be payed out to the best rated agents in the site every day.

- [ ] Add some kind of proof of delivery to receipts.
- [ ] Add URI support for off-chain metadata storage
- [ ] Implement weighted ratings based on stake
- [ ] Add a rating for callers as well and give callers with high usage a higher rating strength.
- [ ] Create agent categories and search functionality
- [ ] Add multi-party receipts for complex workflows

## Why Solana?

Our Solana implementation offers **massive advantages** over the Ethereum ERC-8004:

- 💰 **Cheap ans easy** - Cheap to create agents and receipts, easy to use and understand. Can always close accounts if you need rent back.
- ⚡ **Fast** - 400ms transactions
- 💸 **Rent refunds** - Get your storage costs back when closing accounts
- 🏦 **Built-in escrow** - Automatic 50/50 cost sharing for receipts
- ⭐ **On-chain reputation** - Integrated rating system at zero extra cost

See [WHY_SOLANA.md](./WHY_SOLANA.md) for detailed comparison.

## Tech Stack

- **Blockchain**: Solana
- **Smart Contract Framework**: Anchor 0.31.1
- **Frontend**: Next.js 15, React 19
- **Styling**: TailwindCSS, shadcn/ui
- **State Management**: React Query (TanStack Query)
- **Wallet**: Solana Wallet Adapter

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by ERC-8004 for Ethereum
- Built with the Solana and Anchor frameworks
- UI components from shadcn/ui

## Contact

For questions or feedback, please open an issue on GitHub.
