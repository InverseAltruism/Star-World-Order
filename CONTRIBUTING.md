# Contributing to Star World Order

## Prerequisites

- **Node.js** 22+ (check with `node -v`)
- **npm** (comes with Node.js)

## Development Setup

```bash
git clone https://github.com/InverseAltruism/Star-World-Order.git
cd Star-World-Order
npm install
cp .env.example .env.local  # Configure environment variables
npm run dev                  # Start dev server on port 3000
```

## Testing

Run all checks before submitting changes:

```bash
npm run test          # Unit tests (Vitest)
npm run type-check    # TypeScript validation
npm run lint          # ESLint checks
```

## Build Verification

Ensure the production build succeeds:

```bash
npm run build
```

## Pull Request Guidelines

1. **Branch from `dev`** — all PRs must target the `dev` branch, not `main`.
2. **Create a feature branch**:
   ```bash
   git checkout dev
   git pull origin dev
   git checkout -b feature/your-feature
   ```
3. **Make your changes** following existing code patterns and the synthwave theme.
4. **Run validation** before committing:
   ```bash
   npm run type-check && npm run lint && npm run build
   ```
5. **Commit** with a clear, concise message describing the change.
6. **Push and open a PR** targeting `dev`:
   ```bash
   git push origin feature/your-feature
   gh pr create --base dev
   ```

## Code Style

- Use **TypeScript** with proper types (avoid `any`).
- Follow the **synthwave color palette** for UI (`#00f7ff`, `#ff00ff`, `#ffd700`).
- Use existing utilities from `lib/` — see `CLAUDE.md` for details.
- Use `getStarSkrumpeyMetadataBatch()` from `lib/db` for NFT metadata (not IPFS).
- Use batched multicall for blockchain queries.

## Questions?

Open an issue or reach out on [Twitter/X](https://x.com/StrWorldOrder).
