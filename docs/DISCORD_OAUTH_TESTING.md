# Discord OAuth Integration Testing Guide

## Overview

This document outlines how to test the newly implemented Discord OAuth integration for the Star World Order project.

## Prerequisites

1. **Discord Application**: Create a Discord application at https://discord.com/developers/applications
   - Go to "OAuth2" settings
   - Add redirect URI: `http://localhost:3000/api/auth/callback/discord`
   - Copy the Client ID and Client Secret

2. **Environment Variables**: Configure in `.env.local`:
   ```bash
   NEXT_PUBLIC_DISCORD_CLIENT_ID=your_client_id_here
   DISCORD_CLIENT_SECRET=your_client_secret_here
   NEXT_PUBLIC_DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/callback/discord
   ```

## OAuth Flow

### 1. Initiation (`/api/auth/discord`)

**Request**: `GET /api/auth/discord?wallet=0x123...`

**Process**:
1. Validates wallet address parameter
2. Checks if Discord OAuth is configured
3. Generates secure random state (32 bytes)
4. Sets HTTP-only cookies:
   - `discord_oauth_state`: CSRF protection token
   - `discord_wallet_address`: User's wallet (for database linking)
5. Redirects to Discord authorization URL

**Success Response**: 302 redirect to Discord
**Error Response**: 400 (missing wallet) or 500 (not configured)

### 2. User Authorization (Discord)

User is taken to Discord's authorization page where they:
1. Log into Discord (if not already logged in)
2. Review permissions requested (scope: `identify`)
3. Click "Authorize" to grant access

### 3. Callback (`/api/auth/callback/discord`)

**Request**: `GET /api/auth/callback/discord?code=ABC123&state=XYZ789`

**Process**:
1. Validates state parameter matches cookie (CSRF protection)
2. Exchanges authorization code for access token
3. Fetches user info from `https://discord.com/api/users/@me`
4. Constructs avatar URL from user data
5. Saves connection to database (SQLite)
6. Clears OAuth cookies
7. Redirects to `/profile` with success message

**Success Response**: 302 redirect to `/profile?success=Discord%20account%20connected%20as%20username`
**Error Response**: 302 redirect to `/profile?error=Error%20message`

## Test Cases

### Test Case 1: Successful OAuth Flow

**Steps**:
1. Start dev server: `npm run dev`
2. Visit `http://localhost:3000/profile`
3. Connect your wallet (MetaMask, etc.)
4. Click "CONNECT" on Discord section
5. Authorize on Discord
6. Verify redirect back to profile with success message
7. Verify Discord username appears in connected state

**Expected Result**: ✅ Discord connected successfully

### Test Case 2: OAuth Not Configured

**Steps**:
1. Remove Discord credentials from `.env.local`
2. Restart dev server
3. Visit profile and click "CONNECT" on Discord
4. Observe "OAuth not configured. Try demo mode?" message

**Expected Result**: ✅ Demo mode option shown

### Test Case 3: CSRF Protection

**Steps**:
1. Start OAuth flow normally
2. Before completing authorization, tamper with state parameter in URL
3. Complete authorization
4. Observe error message about invalid state

**Expected Result**: ✅ CSRF attack prevented

### Test Case 4: Session Expiration

**Steps**:
1. Start OAuth flow
2. Wait 11+ minutes (cookie expires after 10 min)
3. Complete authorization
4. Observe error about session expiration

**Expected Result**: ✅ Expired session detected

### Test Case 5: Missing Authorization Code

**Steps**:
1. Manually visit `/api/auth/callback/discord` without code parameter
2. Observe error message

**Expected Result**: ✅ Missing code error shown

### Test Case 6: Database Storage

**Steps**:
1. Complete successful OAuth flow
2. Check database: `sqlite3 data/swo.db "SELECT * FROM social_connections WHERE platform='discord'"`
3. Verify connection exists with:
   - wallet_address
   - platform = 'discord'
   - platform_user_id
   - username
   - avatar_url
   - access_token (encrypted)

**Expected Result**: ✅ Connection stored in database

### Test Case 7: Reconnection

**Steps**:
1. Complete OAuth flow to connect Discord
2. Click "DISCONNECT" to remove connection
3. Click "CONNECT" again to reconnect
4. Verify old connection is updated (not duplicated)

**Expected Result**: ✅ Upsert logic works correctly

## Security Features Verified

- ✅ **CSRF Protection**: State parameter validation
- ✅ **Secure Cookies**: HTTP-only, sameSite: 'lax'
- ✅ **Token Storage**: Access tokens stored server-side only
- ✅ **Input Validation**: Wallet address and OAuth parameters validated
- ✅ **Error Handling**: Comprehensive error messages without leaking sensitive data
- ✅ **Session Expiration**: 10-minute timeout for OAuth state

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/auth/discord` | GET | Initiates OAuth flow |
| `/api/auth/callback/discord` | GET | Handles OAuth callback |

## Database Schema

```sql
CREATE TABLE social_connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('discord', 'x')),
  platform_user_id TEXT NOT NULL,
  username TEXT NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at DATETIME,
  connected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(wallet_address, platform)
);
```

## Troubleshooting

### Issue: 404 on callback
**Solution**: Ensure directories exist: `app/api/auth/callback/discord/`

### Issue: 500 error on initiation
**Solution**: Check Discord OAuth credentials in `.env.local`

### Issue: State mismatch error
**Solution**: Clear browser cookies and try again. Ensure system time is correct.

### Issue: Database error
**Solution**: Initialize database: `npm run db:init`

### Issue: "Session expired" immediately
**Solution**: Check sameSite cookie setting. Use 'lax' not 'strict'.

## Validation Script

Run the validation script to verify implementation:

```bash
node scripts/validate-discord-oauth.js
```

This checks:
- Route files exist
- Key features are implemented
- SocialConnect component is updated
- All security measures are in place

## Comparison with X (Twitter) OAuth

Both OAuth implementations follow the same pattern:

| Feature | Discord | X (Twitter) |
|---------|---------|-------------|
| **Initiation Route** | `/api/auth/discord` | `/api/auth/x` |
| **Callback Route** | `/api/auth/callback/discord` | `/api/auth/callback/x` |
| **CSRF Protection** | State parameter | State parameter |
| **Additional Security** | - | PKCE (code challenge) |
| **Cookie Storage** | HTTP-only, 10 min | HTTP-only, 10 min |
| **Database Integration** | ✅ | ✅ |
| **Error Handling** | ✅ | ✅ |

**Note**: X OAuth uses PKCE (Proof Key for Code Exchange) as an additional security measure required by Twitter's OAuth 2.0 implementation. Discord does not require PKCE.

## Acceptance Criteria

- ✅ Discord "Connect" button initiates OAuth flow without errors
- ✅ Users are redirected to Discord's authorization page
- ✅ After authorization, users are redirected back to `/profile`
- ✅ Discord connection is saved to the database
- ✅ Success/error messages display correctly
- ✅ OAuth state validation prevents CSRF attacks
- ✅ Server-side OAuth implementation (no client-side token exposure)
- ✅ Follows same pattern as X (Twitter) OAuth
- ✅ TypeScript type checking passes
- ✅ Build succeeds without errors

## Next Steps for Production

1. **Environment Variables**: Update production environment with Discord OAuth credentials
2. **Redirect URI**: Update Discord app settings with production callback URL:
   ```
   https://starworldorder.com/api/auth/callback/discord
   ```
3. **Cookie Security**: Ensure `secure: true` in production (automatic via `NODE_ENV`)
4. **Rate Limiting**: Consider adding rate limiting to OAuth endpoints
5. **Monitoring**: Add logging/monitoring for OAuth failures

## References

- Discord OAuth2 Documentation: https://discord.com/developers/docs/topics/oauth2
- Discord User API: https://discord.com/developers/docs/resources/user
- Next.js Route Handlers: https://nextjs.org/docs/app/building-your-application/routing/route-handlers
