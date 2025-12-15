# Security Policy

## Overview

The Star World Order team takes the security of our code and community seriously. We appreciate the security research community's efforts in helping us maintain a secure platform for our DAO members.

## Supported Versions

We currently support security updates for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| main    | :white_check_mark: |
| dev     | :white_check_mark: |

## Reporting a Vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in Star World Order, please report it to us responsibly:

### Preferred Method: GitHub Security Advisory

1. Navigate to the [Security tab](https://github.com/InverseAltruism/Star-World-Order/security) of our repository
2. Click "Report a vulnerability"
3. Fill out the vulnerability report form with as much detail as possible

### Alternative Method: Email

If you prefer not to use GitHub's security advisory feature, you can email security concerns to the repository maintainers by creating a private issue or contacting maintainers directly through GitHub.

### What to Include

Please include the following information in your report:

- **Type of vulnerability** (e.g., XSS, SQL injection, authentication bypass, etc.)
- **Full path(s)** of source file(s) related to the vulnerability
- **Location** of the affected source code (tag/branch/commit or direct URL)
- **Step-by-step instructions** to reproduce the issue
- **Proof of concept or exploit code** (if possible)
- **Impact** of the vulnerability (what an attacker could achieve)
- **Potential fixes** or mitigation suggestions (if you have any)

## Response Timeline

- **Acknowledgment**: We aim to acknowledge receipt of your vulnerability report within 48 hours
- **Initial Assessment**: We will provide an initial assessment within 5 business days
- **Status Updates**: We will keep you informed of our progress throughout the investigation
- **Resolution**: We aim to resolve critical vulnerabilities within 30 days of disclosure

## Disclosure Policy

- Security vulnerabilities will be disclosed publicly only after:
  - A fix has been developed and deployed
  - Affected parties have been notified
  - A reasonable timeline has passed to allow users to update
- We follow coordinated disclosure practices
- We will credit researchers who responsibly disclose vulnerabilities (if desired)

## Security Scope

### In Scope

The following are considered in scope for security research:

- **Smart Contracts**: All contracts in `/contracts/` directory
  - StarSkrumpeyMarketplace.sol
  - StarSkrumpeyStaking.sol
  - StarWorldOrderGovernor.sol
- **Backend APIs**: All API routes in `/app/api/` directory
- **Authentication & Authorization**: Wallet connection, OAuth flows, access control
- **Database Security**: SQLite queries, SQL injection vulnerabilities
- **Frontend Security**: XSS, CSRF, client-side vulnerabilities
- **Environment Configuration**: Secrets management, environment variable handling

### Out of Scope

The following are considered out of scope:

- **Third-party dependencies**: Issues that originate from third-party libraries (though we appreciate notifications)
- **Social engineering**: Phishing, impersonation attacks against users
- **Physical security**: Attacks requiring physical access to infrastructure
- **Denial of Service**: DoS or DDoS attacks
- **Spam**: Content spam or non-security-impacting spam
- **Previously reported vulnerabilities**: Issues already reported by others

## Security Best Practices

### For Contributors

When contributing to Star World Order, please follow these security practices:

1. **Never commit secrets**: Use environment variables for all sensitive data
2. **Review `.gitignore`**: Ensure sensitive files are excluded from version control
3. **Validate inputs**: Always sanitize and validate user inputs
4. **Use parameterized queries**: Prevent SQL injection with prepared statements
5. **Implement access controls**: Verify Star Skrumpey ownership before granting access
6. **Follow secure coding practices**: Reference OWASP guidelines for web security

### For Operators

When deploying Star World Order:

1. **Use `.env.local`**: Never commit production environment files
2. **Rotate secrets regularly**: Change API keys and secrets periodically
3. **Keep dependencies updated**: Regularly update npm packages
4. **Enable HTTPS**: Always use SSL/TLS in production
5. **Monitor logs**: Review application logs for suspicious activity
6. **Backup databases**: Maintain regular backups of SQLite databases

## Security Verification Checklist

This repository has been hardened for public release. The following security measures are in place:

### Environment & Configuration
- ✅ `.gitignore` properly excludes `.env`, `.env*.local`, `node_modules/`, and sensitive files
- ✅ `.env.example` contains only placeholder values and documentation
- ✅ No hardcoded private keys or API secrets in codebase
- ✅ No real IP addresses exposed in documentation (use `<INTERNAL-IP>`, `<YOUR-PUBLIC-IP>` placeholders)

### OAuth & Authentication
- ✅ All OAuth credentials use environment variables (not hardcoded)
- ✅ Server-side secrets (X_CLIENT_SECRET, DISCORD_CLIENT_SECRET) never exposed to client
- ✅ Public client IDs (NEXT_PUBLIC_X_CLIENT_ID, NEXT_PUBLIC_DISCORD_CLIENT_ID) safely exposed
- ✅ PKCE flow implemented for X OAuth 2.0 (prevents authorization code interception)
- ✅ CSRF protection via state parameter validation
- ✅ HTTP-only cookies for session management

### Smart Contracts
- ✅ ReentrancyGuard on marketplace and staking contracts
- ✅ Pausable emergency controls for marketplace
- ✅ Access control modifiers (onlyOwner, etc.)
- ✅ SafeERC20 for token transfers
- ✅ No hardcoded addresses (all configurable via environment variables)

### Database Security
- ✅ Prepared statements used throughout (SQL injection prevention)
- ✅ Input validation on wallet addresses
- ✅ Access tokens stored securely in server-side database

### Frontend Security
- ✅ Input sanitization for user-generated content
- ✅ Environment-based feature locking (prod vs dev mode)
- ✅ Access control based on NFT ownership verification
- ✅ Demo mode read-only restrictions

## Bug Bounty Program

At this time, Star World Order does not have a formal bug bounty program. However, we deeply appreciate security researchers' efforts and will:

- Publicly acknowledge responsible disclosure (if desired)
- Consider recognition in project credits
- Provide detailed feedback on reported issues

We may establish a formal bug bounty program in the future as the project grows.

## Additional Resources

- **OWASP Top 10**: https://owasp.org/www-project-top-ten/
- **Smart Contract Security**: https://consensys.github.io/smart-contract-best-practices/
- **Web3 Security**: https://ethereum.org/en/developers/docs/security/

## Contact

For non-security-related questions, please use:
- **GitHub Issues**: https://github.com/InverseAltruism/Star-World-Order/issues
- **Twitter**: https://x.com/StrWorldOrder

---

**Last Updated**: December 15, 2024

Thank you for helping keep Star World Order and our community safe! 🛡️⭐
