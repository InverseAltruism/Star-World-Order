# Star World Order (SWO)

## 🌟 Project Overview

**Star World Order (SWO)** is an NFT/DAO focused decentralized application featuring **Skrumpeys** - unique 64x64 pixel art creatures that vaguely resemble frogs. The project specifically focuses on Skrumpeys with **star traits** and operates on the **Monad blockchain**.

### What are Skrumpeys?
- **Format**: 64x64 pixel art NFTs
- **Style**: Pixel art creatures with frog-like characteristics
- **Special Focus**: Star trait variants
- **Uniqueness**: Each Skrumpey has distinct traits and attributes

## 🎯 Project Goals

1. Build an immersive web experience for the Skrumpey community
2. Enable seamless wallet connections for users
3. Create a DAO governance structure for community-driven decisions
4. Showcase and trade Skrumpey NFTs on the Monad chain
5. Foster a vibrant community around Star World Order

## 🔗 Blockchain & Technology

### Monad Chain
- **Blockchain**: Monad (high-performance EVM-compatible chain)
- **Chain ID**: 41454 (to be confirmed)
- **Native Currency**: MON
- **Explorer**: https://explorer.monad.xyz (placeholder)

### Supported Wallets
The dapp supports multiple wallet providers:
- **MetaMask** - Browser extension and mobile wallet
- **Trust Wallet** - Mobile-first wallet
- **Phantom** - Multi-chain wallet support

All wallets connect through the standard injected provider interface.

## 🛠️ Technical Stack

### Frontend Framework
- **Next.js 16** - React framework with App Router
- **React 19** - UI library
- **TypeScript** - Type-safe development
- **Tailwind CSS 4** - Utility-first styling

### Web3 Integration
- **Wagmi 3** - React hooks for Ethereum
- **Viem 2** - TypeScript Ethereum library
- **Ethers 6** - Ethereum JavaScript library
- **TanStack Query 5** - Data fetching and caching

### Key Features
- Server-side rendering (SSR) support
- Type-safe blockchain interactions
- Responsive design with dark theme
- Modular component architecture

## 📁 Project Structure

```
star-world-order/
├── app/                    # Next.js app directory
│   ├── layout.tsx         # Root layout with metadata
│   ├── page.tsx           # Home page
│   ├── providers.tsx      # Web3 and query providers
│   └── globals.css        # Global styles
├── components/            # React components
│   ├── Header.tsx         # Navigation header
│   ├── Hero.tsx           # Hero section
│   ├── Features.tsx       # Features grid
│   └── WalletConnect.tsx  # Wallet connection component
├── lib/                   # Utility libraries
│   └── wagmi.ts          # Wagmi configuration
├── utils/                 # Helper functions
├── public/               # Static assets
├── next.config.ts        # Next.js configuration
├── tailwind.config.ts    # Tailwind configuration
├── tsconfig.json         # TypeScript configuration
└── package.json          # Dependencies and scripts
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- A Web3 wallet (MetaMask, Trust Wallet, or Phantom)
- Access to Monad testnet/mainnet

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/InverseAltruism/Star-World-Order.git
   cd Star-World-Order
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env.local
   ```
   Edit `.env.local` with your configuration.

4. **Run the development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to [http://localhost:3000](http://localhost:3000)

### Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run type-check` - Run TypeScript type checking

## 🔧 Configuration

### Monad Chain Setup

The Monad chain configuration is in `lib/wagmi.ts`:

```typescript
export const monad = defineChain({
  id: 41454, // Update with actual chain ID
  name: 'Monad',
  nativeCurrency: { decimals: 18, name: 'Monad', symbol: 'MON' },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
});
```

**Note**: Update RPC URLs and chain ID when Monad finalizes their network details.

### Wallet Connection

The wallet connection uses Wagmi's `injected` connector, which automatically detects:
- MetaMask
- Trust Wallet
- Phantom
- Other EIP-1193 compatible wallets

## 📋 Future Development

### Phase 1: Foundation ✅
- [x] Project setup and configuration
- [x] Basic UI/UX with responsive design
- [x] Multi-wallet connection support
- [x] Monad chain integration
- [x] Component architecture

### Phase 2: NFT Integration (Upcoming)
- [ ] NFT contract deployment on Monad
- [ ] NFT minting interface
- [ ] Collection gallery/marketplace
- [ ] Individual NFT detail pages
- [ ] Metadata and trait display
- [ ] IPFS integration for assets

### Phase 3: DAO Features (Upcoming)
- [ ] DAO smart contract deployment
- [ ] Governance token distribution
- [ ] Proposal creation and voting
- [ ] Treasury management
- [ ] Member dashboard

### Phase 4: Advanced Features (Upcoming)
- [ ] Skrumpey breeding/evolution system
- [ ] Staking mechanism
- [ ] Rewards and incentives
- [ ] Community events and drops
- [ ] Mobile app development

### Phase 5: Community & Growth (Upcoming)
- [ ] Discord/Telegram integration
- [ ] Leaderboards and achievements
- [ ] Referral system
- [ ] Analytics dashboard
- [ ] Marketing and partnerships

## 🎨 Design System

### Color Palette
- **Primary**: Indigo (#6366f1)
- **Accent**: Amber (#fbbf24)
- **Background**: Dark (#0a0a0a)
- **Foreground**: Light gray (#ededed)

### Typography
- Default sans-serif font stack
- Responsive text sizes
- Gradient text for headlines

### Components
All components follow a consistent design pattern:
- Dark theme with subtle borders
- Hover effects for interactivity
- Responsive breakpoints (mobile, tablet, desktop)

## 🔐 Security Considerations

- Never commit private keys or sensitive data
- Use environment variables for configuration
- Validate all user inputs
- Implement proper error handling
- Regular security audits for smart contracts
- Follow Web3 best practices

## 📝 Smart Contract Development

### Contract Structure (To Be Implemented)
```
contracts/
├── SkrumpeyNFT.sol      # ERC-721 NFT contract
├── SkrumpeyDAO.sol      # DAO governance contract
└── SkrumpeyStaking.sol  # Staking rewards contract
```

### Development Tools
- Hardhat or Foundry for contract development
- OpenZeppelin for secure contract libraries
- Monad testnet for testing

## 🤝 Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- Use TypeScript for all new files
- Follow existing code formatting
- Add comments for complex logic
- Write meaningful commit messages

## 📄 License

This project is licensed under the ISC License.

## 📞 Contact & Community

- **GitHub**: [InverseAltruism/Star-World-Order](https://github.com/InverseAltruism/Star-World-Order)
- **Website**: Coming soon
- **Discord**: Coming soon
- **Twitter**: Coming soon

## 🙏 Acknowledgments

- Monad team for the high-performance blockchain
- The Skrumpey community
- Web3 developer community
- Open-source contributors

---

**Built with ⭐ by the Star World Order community**
