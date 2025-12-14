# Testing Production Features

This document provides testing instructions for the production-ready features implemented for public release.

## Environment Mode Testing

### Testing PROD Mode

1. **Set environment variable:**
   ```bash
   NEXT_PUBLIC_ENV_MODE=prod npm run dev
   ```

2. **Expected behavior:**
   - DAO link in header shows 🔒 icon and is grayed out
   - Exchange link in header shows 🔒 icon and is grayed out
   - "Enter the Order" button shows 🔒 icons and is disabled
   - Clicking locked items does nothing (no navigation)
   - Demo Mode button is visible next to Wallet Connect

3. **Visual verification:**
   - Lock icons visible above DAO and Exchange in header
   - Locked items have gray text color
   - Hovering over locked items shows no hover effect
   - "Enter the Order" button is visually disabled

### Testing DEV Mode

1. **Set environment variable:**
   ```bash
   NEXT_PUBLIC_ENV_MODE=dev npm run dev
   ```

2. **Expected behavior:**
   - All navigation links work normally
   - No lock icons visible
   - "Enter the Order" button is clickable
   - Links have normal hover effects
   - Demo Mode button is still visible

3. **Visual verification:**
   - No lock icons anywhere
   - All links have normal colors
   - Hover effects work on all links
   - All navigation works as expected

### Testing Auto-Detection (Production URL)

1. **Deploy to production domain:**
   - App automatically detects `starworldorder.com` as PROD
   - Features are locked without setting environment variable

2. **Local development:**
   - `localhost` automatically detected as DEV
   - `192.168.x.x` automatically detected as DEV

## Demo Mode Testing

### Opening Demo Mode

1. **Find the Demo Mode button:**
   - Located next to Wallet Connect button in header
   - Also appears on AccessGate (locked pages)

2. **Click Demo Mode button:**
   - Modal appears with wallet address input
   - Modal shows explanation of what works/doesn't work

### Entering Demo Mode

1. **Invalid input testing:**
   - Enter non-address text → Shows error "Invalid wallet address format"
   - Enter empty input → Shows error "Please enter a wallet address"

2. **Valid input testing:**
   - Enter valid Ethereum address (0x...)
   - Click "Enter Demo Mode"
   - Modal closes
   - Demo Mode indicator appears (top right)

3. **Demo Mode indicator:**
   - Shows "DEMO MODE" badge with 🎮 icon
   - Badge has golden glow effect
   - "Exit Demo" button appears next to indicator

### Demo Mode Functionality

1. **Feature unlocks:**
   - Enter wallet address that owns Star Skrumpeys
   - Profile page shows NFTs from that wallet
   - DAO features unlock based on NFT holdings
   - Marketplace shows listings

2. **Read-only verification:**
   - Try to change username → Should be disabled
   - Try to create listing → Should be disabled
   - All write operations should be blocked

3. **Exiting Demo Mode:**
   - Click "Exit Demo" button
   - Demo Mode indicator disappears
   - Returns to normal state

### Demo Mode on AccessGate

1. **Visit protected page without wallet connected:**
   - Go to `/profile` or `/dao`
   - AccessGate shows locked screen
   - Demo Mode button visible below Wallet Connect

2. **Use Demo Mode from AccessGate:**
   - Click Demo Mode button on locked screen
   - Enter wallet address
   - Page unlocks and shows content

## Security Testing

### IP Address Redaction

1. **Check SERVER_OPS.md:**
   - No real IP addresses visible
   - Placeholders used: `<INTERNAL-IP>`, `<YOUR-PUBLIC-IP>`

2. **Check all documentation:**
   ```bash
   grep -rn "192\.168" --include="*.md" .
   ```
   - Should return no results

### API Credentials Security

1. **Check API_CREDENTIALS.md:**
   - No real API keys visible
   - Only placeholders like `<YOUR-X-CLIENT-ID>`

2. **Check .env.example:**
   - No real values, only commented placeholders
   - All secrets are placeholder text

3. **Verify codebase:**
   ```bash
   grep -rn "Bearer\|Secret.*=.*[a-zA-Z0-9]\{20,\}" --include="*.ts" --include="*.tsx" .
   ```
   - Should only show environment variable imports

## Build & Type Testing

### TypeScript Compilation

```bash
npm run type-check
```

**Expected:** ✅ No type errors

### Production Build

```bash
npm run build
```

**Expected:** ✅ Build succeeds

### CodeQL Security Scan

**Expected:** ✅ No security vulnerabilities

## Browser Testing

### Desktop Testing

1. **Test in Chrome/Edge:**
   - All features work
   - UI renders correctly
   - Lock icons visible in PROD mode

2. **Test in Firefox:**
   - Demo Mode modal works
   - All interactions functional

3. **Test in Safari:**
   - Wallet connection works
   - Demo Mode functions properly

### Mobile Testing

1. **Responsive design:**
   - Lock icons stack vertically on mobile
   - Demo Mode button accessible
   - Modal fits screen properly

2. **Touch interactions:**
   - Demo Mode button tappable
   - Modal dismisses on outside tap
   - All inputs work with mobile keyboard

## Integration Testing

### Wallet Integration

1. **Connect real wallet:**
   - Wallet Connect button works
   - Connection persists across pages
   - Demo Mode disabled when real wallet connected

2. **Demo Mode vs Real Wallet:**
   - Cannot use Demo Mode while wallet connected
   - Disconnect wallet to enable Demo Mode
   - Demo Mode indicator clearly distinguishes from real connection

### NFT Verification

1. **With Star Skrumpeys:**
   - Demo Mode with star holder address unlocks features
   - Profile shows correct NFTs
   - Access granted to restricted pages

2. **Without Star Skrumpeys:**
   - Demo Mode with non-holder address shows locked
   - AccessGate still blocks access
   - Proper error messages shown

## Performance Testing

### Load Time

1. **Initial page load:**
   - Environment detection is instant
   - Lock icons render immediately
   - No layout shift on lock icon appearance

2. **Demo Mode:**
   - Modal opens instantly
   - Address validation is immediate
   - NFT data fetches with loading state

### Caching

1. **Demo Mode cache:**
   - NFT data cached for 5 minutes
   - Subsequent page loads use cache
   - Manual refresh updates cache

## Accessibility Testing

### Keyboard Navigation

1. **Tab through elements:**
   - Demo Mode button focusable
   - Modal inputs accessible
   - Lock icons have title attributes

2. **Screen reader:**
   - Locked items announce as disabled
   - Demo Mode indicator readable
   - Error messages announced

### Visual Indicators

1. **Color contrast:**
   - Lock icons visible against background
   - Disabled state clearly distinguishable
   - Demo Mode indicator stands out

2. **Focus indicators:**
   - Demo Mode button has focus ring
   - Modal inputs show focus state
   - All interactive elements accessible

## Edge Cases

### Network Issues

1. **Slow connection:**
   - Loading states show properly
   - Timeouts handled gracefully
   - Error messages clear

2. **RPC failures:**
   - Fallback endpoints used
   - Retry logic activates
   - User notified of issues

### State Management

1. **Page refresh:**
   - Environment mode persists
   - Demo Mode state maintained
   - Wallet connection preserved

2. **Browser back/forward:**
   - Navigation works correctly
   - State remains consistent
   - No duplicate checks

## Checklist

- [ ] PROD mode shows lock icons
- [ ] DEV mode all links work
- [ ] Demo Mode button appears
- [ ] Demo Mode modal accepts addresses
- [ ] Demo Mode unlocks features
- [ ] Demo Mode indicator visible
- [ ] AccessGate has Demo Mode button
- [ ] IP addresses redacted
- [ ] API credentials removed
- [ ] Build succeeds
- [ ] Type check passes
- [ ] CodeQL scan clean
- [ ] Desktop browsers work
- [ ] Mobile responsive
- [ ] Wallet integration works
- [ ] NFT verification works
- [ ] Performance acceptable
- [ ] Accessibility compliant

## Troubleshooting

### Lock icons not showing

**Problem:** Links work normally even in PROD mode

**Solution:**
1. Check environment variable is set: `NEXT_PUBLIC_ENV_MODE=prod`
2. Verify not accessing via localhost (auto-detected as DEV)
3. Clear cache and reload

### Demo Mode not unlocking features

**Problem:** Entered valid address but features still locked

**Solution:**
1. Verify address owns Star Skrumpeys
2. Check RPC connection (console logs)
3. Try manual refresh
4. Check cache (may need to wait 5 minutes)

### Build fails

**Problem:** TypeScript errors or build errors

**Solution:**
1. Run `npm install` to ensure all dependencies installed
2. Check for missing imports
3. Verify all new files are properly typed
4. Review error messages for specifics
