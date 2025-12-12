# Contributing to Star World Order

Thank you for your interest in contributing to the Star World Order (SWO) project! This document provides guidelines for contributing to the project.

## Getting Started

1. **Fork the repository**
2. **Clone your fork**: `git clone https://github.com/YOUR_USERNAME/Star-World-Order.git`
3. **Install dependencies**: `npm install`
4. **Create a branch**: `git checkout -b feature/your-feature-name`
5. **Make your changes**
6. **Test your changes**: `npm run dev`, `npm run build`, `npm run type-check`
7. **Commit your changes**: `git commit -m "Description of changes"`
8. **Push to your fork**: `git push origin feature/your-feature-name`
9. **Create a Pull Request**

## Development Guidelines

### Code Style

- Use TypeScript for all new files
- Follow the existing code structure and naming conventions
- Use meaningful variable and function names
- Add comments for complex logic
- Keep components small and focused

### Component Structure

```typescript
// Use functional components with TypeScript
export default function ComponentName() {
  // Component logic here
  return (
    // JSX here
  );
}
```

### Styling

- Use Tailwind CSS utility classes
- Follow the existing color scheme (primary, accent, dark theme)
- Ensure responsive design (mobile-first approach)
- Test on multiple screen sizes

### Web3 Integration

- Use Wagmi hooks for blockchain interactions
- Handle loading and error states properly
- Add proper error messages for users
- Test with different wallet providers

## Project Structure

- `app/` - Next.js pages and layouts
- `components/` - React components
- `lib/` - Utility libraries and configurations
- `utils/` - Helper functions
- `public/` - Static assets

## Testing

Before submitting a PR:

1. Run type checking: `npm run type-check`
2. Build the project: `npm run build`
3. Test locally: `npm run dev`
4. Test wallet connections
5. Test on mobile and desktop

## Commit Messages

Use clear, descriptive commit messages:

- `feat: Add new feature`
- `fix: Fix bug in component`
- `docs: Update documentation`
- `style: Format code`
- `refactor: Refactor component`
- `test: Add tests`
- `chore: Update dependencies`

## Pull Request Process

1. Ensure your code follows the guidelines above
2. Update documentation if needed
3. Describe your changes clearly in the PR description
4. Link any related issues
5. Wait for review and address feedback

## Areas for Contribution

### High Priority
- NFT smart contract development
- DAO governance implementation
- Marketplace/gallery features
- Staking mechanisms

### Medium Priority
- Additional UI components
- Animation and transitions
- Performance optimizations
- Accessibility improvements

### Low Priority
- Documentation improvements
- Code refactoring
- Unit tests
- Integration tests

## Questions?

If you have questions, feel free to:
- Open an issue for discussion
- Reach out to the team
- Check the README for more information

## Code of Conduct

Be respectful and constructive in all interactions. We're building a community together!

---

Thank you for contributing to Star World Order! 🌟
