# Bug Fixes: Constellation Traits and Gradient Text

## Overview

This PR fixes two bugs:

1. **Wrong constellation traits displayed on Members page**
2. **Gradient text shows as solid bar instead of gradient text**

## Bug #1: Wrong Constellation Traits

### Problem
The Members page was showing incorrect constellation variants for Star Skrumpeys. For example, token #759 was showing as "AURACORE" when it should be "SPECTRA".

### Root Cause
The `star_skrumpey_metadata` database table was empty (0 records), causing `getStarSkrumpeyMetadataBatch()` to return an empty Map. The code then fell back to `getStarVariantForTokenId()` which reads from the static placeholder map in `data/starConstellationData.ts` containing incorrect data.

### Solution
Created a new script `scripts/populate-db-from-static.ts` that populates the database with constellation data from the static map. This is a **fallback solution** for environments where IPFS is not accessible.

**For production deployment**, you should run:
```bash
npm run db:fetch-metadata  # Fetches accurate data from IPFS
```

**For development/testing** (when IPFS is not accessible):
```bash
npm run db:populate-static  # Uses static map data (may be inaccurate)
```

### Files Changed
- `package.json` - Added `db:populate-static` script
- `scripts/populate-db-from-static.ts` - New script to populate DB from static map

### Important Notes
- The static constellation map (`data/starConstellationData.ts`) contains **placeholder data** and may be incorrect
- The **correct source of truth** is IPFS metadata
- In production, always use `npm run db:fetch-metadata` to fetch accurate data from IPFS
- The database should be populated once during deployment, then periodically refreshed

## Bug #2: Gradient Text Rendering

### Problem
In the NFT collection grid on ProfileCard, the constellation name (e.g., "Spectra") was showing as a solid gradient bar instead of gradient-colored text.

### Root Cause
The CSS property `-webkit-background-clip: text` was not being applied properly when the inline style was on a `<p>` tag with the `truncate` class. The Tailwind `truncate` class conflicts with the gradient background-clip styles.

### Solution
Wrapped the gradient text in a `<span>` element inside the `<p>` tag to separate the truncate behavior from the gradient styles.

**Before** (line 951):
```tsx
<p className="text-[10px] sm:text-xs truncate" style={nft.hasStar ? getVariantTextStyle(nft.starVariant) : { color: '#666' }}>
  {nft.rarity}
</p>
```

**After**:
```tsx
<p className="text-[10px] sm:text-xs truncate">
  <span style={nft.hasStar ? getVariantTextStyle(nft.starVariant) : { color: '#666' }}>
    {nft.rarity}
  </span>
</p>
```

### Files Changed
- `components/ProfileCard.tsx` - Fixed gradient text rendering on line 951

### Technical Details
The `getVariantTextStyle()` function correctly generates the gradient style with:
- `display: 'inline-block'`
- `background: <gradient>`
- `WebkitBackgroundClip: 'text'`
- `backgroundClip: 'text'`
- `WebkitTextFillColor: 'transparent'`
- `color: 'transparent'`

By separating the truncate behavior (on `<p>`) from the gradient styles (on `<span>`), the gradient now renders correctly.

## Testing

### Bug #1 Testing
1. Ensure database is populated: `npm run db:populate-static`
2. Start dev server: `npm run dev`
3. Navigate to `/members` page
4. Verify constellation names are displayed correctly

### Bug #2 Testing
1. Start dev server: `npm run dev`
2. Navigate to `/profile` page (or any page with ProfileCard)
3. Look at NFT collection grid
4. Verify constellation text shows as gradient-colored text, not a solid bar

## Deployment Instructions

### For Production
1. Run `npm run db:fetch-metadata` to populate database with accurate IPFS data
2. Deploy the updated code
3. Verify Members page shows correct constellations
4. Verify ProfileCard gradient text renders correctly

### For Development/Testing
1. Run `npm run db:populate-static` to populate database with static data
2. Start dev server: `npm run dev`
3. Test both fixes

## Additional Notes

- The database population only needs to be done once per environment
- For ongoing updates, set up a cron job to run `npm run db:fetch-metadata` periodically
- The static map should eventually be updated with correct IPFS data by running `npx tsx scripts/fetch_constellations.ts`
