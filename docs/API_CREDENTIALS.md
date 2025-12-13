# 🔐 API Configuration & Credentials

This document contains the necessary API credentials and configuration for the Star World Order application. These credentials are used for social authentication features.

> **⚠️ IMPORTANT**: This repository will be made private. Never commit credentials to a public repository.

## X (Twitter) OAuth 2.0 Configuration

The following credentials are used for Twitter/X login functionality:

| Key | Value |
|-----|-------|
| **API Key** | `eLdLZ9zXTlEHZWwujsUgMVudv` |
| **API Key Secret** | `UNLMXmJwQEApO51UswW2jXVaCLUkP5GHBNoNUAmWYKkwoCZp8M` |
| **Bearer Token** | `AAAAAAAAAAAAAAAAAAAAAIC62QEAAAAARwTKZyBxNmTKen1cM778zfg1Isc%3DJ9AmCvHMFmCVPwA7tY8L7nueZXcjlZEgVXvI9T8Mgs37p8UQPC` |
| **Access Token** | `1688691125811302400-UcYyak7TMHk7bm8O7NnQZKzZlogEpt` |
| **Access Token Secret** | `6ytZ9xH807RATqaHsVI8p1SxUkniEEK0XZXBpu00aJGno` |
| **Client ID** | `TmlJTUdKVHNkTzJwR2wtVG1XS1o6MTpjaQ` |
| **Client Secret** | `rpozGS5-cLYeqHlBsXLh8Z6r2smjewG0Tsm023C3DEzk1GRQxQ` |

### Environment Variables Setup

Add these to your `.env.local` file:

```bash
# X (Twitter) OAuth 2.0 Configuration
NEXT_PUBLIC_X_CLIENT_ID=TmlJTUdKVHNkTzJwR2wtVG1XS1o6MTpjaQ
X_CLIENT_SECRET=rpozGS5-cLYeqHlBsXLh8Z6r2smjewG0Tsm023C3DEzk1GRQxQ
NEXT_PUBLIC_X_REDIRECT_URI=http://localhost:3000/api/auth/callback/x
```

### Twitter Developer Portal Settings

When setting up the app in the [Twitter Developer Portal](https://developer.twitter.com/):

1. **App Type**: Web App
2. **Callback URL / Redirect URI**: `http://localhost:3000/api/auth/callback/x`
   - For production, add your production URL as well
3. **Website URL**: Your website URL
4. **Required Scopes**: 
   - `users.read` - Read user profile information
   - `tweet.read` - Required for OAuth 2.0
   - `offline.access` - For refresh tokens

## OAuth Flow Overview

### X (Twitter) OAuth 2.0 with PKCE

1. User clicks "Connect X" button on their profile
2. Frontend redirects to `/api/auth/x?wallet=<address>`
3. Server generates PKCE code verifier and challenge
4. Server stores verifier in HTTP-only cookie
5. User is redirected to Twitter authorization page
6. After authorization, Twitter redirects to `/api/auth/callback/x`
7. Server exchanges code for access token using PKCE
8. Server fetches user info from Twitter API
9. Connection is saved to SQLite database
10. User is redirected back to profile page

## Database Storage

Social connections are stored in the SQLite database with the following schema:

```sql
CREATE TABLE social_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,          -- User's Ethereum wallet address
  platform TEXT NOT NULL,                -- 'discord' or 'x'
  platform_user_id TEXT NOT NULL,        -- Twitter user ID
  username TEXT NOT NULL,                -- Twitter username (without @)
  display_name TEXT,                     -- Twitter display name
  avatar_url TEXT,                       -- Profile image URL
  access_token TEXT,                     -- OAuth access token
  refresh_token TEXT,                    -- OAuth refresh token
  token_expires_at DATETIME,             -- Token expiration time
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, platform)
);
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/x` | GET | Initiates X OAuth flow |
| `/api/auth/callback/x` | GET | Handles X OAuth callback |
| `/api/social-connections` | GET | Get user's social connections |
| `/api/social-connections` | DELETE | Remove a social connection |

## Security Notes

- OAuth state parameter prevents CSRF attacks
- PKCE (Proof Key for Code Exchange) secures the token exchange
- Tokens are stored server-side in the database
- Client secrets are never exposed to the frontend
- HTTP-only cookies used for OAuth flow parameters

## Testing the Integration

1. Set up environment variables in `.env.local`
2. Start the development server: `npm run dev`
3. Connect a wallet on the profile page
4. Click "Connect" for X (Twitter)
5. Authorize the app on Twitter
6. Verify the connection appears on the profile page
7. Test disconnect functionality

## Troubleshooting

### Common Issues

1. **"OAuth not configured"**: Ensure `NEXT_PUBLIC_X_CLIENT_ID` is set
2. **"Failed to exchange authorization code"**: Check `X_CLIENT_SECRET` is correct
3. **State mismatch error**: Clear cookies and try again
4. **Invalid callback URL**: Ensure callback URL matches Twitter Developer Portal settings
