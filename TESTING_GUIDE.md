# Testing Guide for Bug Fixes

## How to Test Bug #1: Constellation Traits

### Setup
1. Ensure database is populated:
   ```bash
   npm run db:populate-static
   ```
   
2. Verify database has data:
   ```bash
   sqlite3 data/swo.db "SELECT COUNT(*) FROM star_skrumpey_metadata;"
   # Should return: 333
   ```

### Test via API
```bash
curl "http://localhost:3000/api/metadata?tokenIds=759,762" | jq '.'
```

**Expected Result:**
```json
{
  "success": true,
  "metadata": {
    "759": {
      "constellation": "spectra"
    },
    "762": {
      "constellation": "spectra"
    }
  }
}
```

**Before Fix:** Would show "auracore" (incorrect static data)
**After Fix:** Shows "spectra" (correct from database)

### Test via Members Page
1. Start dev server: `npm run dev`
2. Navigate to: http://localhost:3000/members
3. Look for users holding tokens 759 or 762
4. Verify constellation shows as "Spectra" (not "Auracore")

## How to Test Bug #2: Gradient Text Rendering

### Visual Test
1. Start dev server: `npm run dev`
2. Navigate to: http://localhost:3000/profile
3. Look at NFT collection grid (if user owns Star Skrumpeys)
4. Check the constellation name text (e.g., "Spectra", "Aether", etc.)

**Before Fix:** Constellation name appears as a solid gradient-colored bar (no text visible)
**After Fix:** Constellation name appears as text with gradient coloring applied

### Technical Verification
The fix wraps the gradient text in a `<span>` element:

**Before (line 951):**
```tsx
<p className="text-[10px] sm:text-xs truncate" style={...}>
  {nft.rarity}
</p>
```

**After (line 951-955):**
```tsx
<p className="text-[10px] sm:text-xs truncate">
  <span style={...}>
    {nft.rarity}
  </span>
</p>
```

The `truncate` class is on the `<p>` tag, while the gradient style is on the `<span>`, preventing CSS conflicts.

### Inspect Element Test
1. Open browser DevTools (F12)
2. Inspect the constellation name element
3. Verify the rendered HTML looks like:
   ```html
   <p class="text-[10px] sm:text-xs truncate">
     <span style="display: inline-block; background: linear-gradient(...); -webkit-background-clip: text; background-clip: text; -webkit-text-fill-color: transparent; color: transparent;">
       Spectra
     </span>
   </p>
   ```
4. Confirm `-webkit-background-clip: text` is present in the `<span>` style
5. Confirm the text is visible and gradient-colored (not a solid bar)

## Database Population

### For Production (Accurate IPFS Data)
```bash
npm run db:fetch-metadata
```
This fetches metadata from IPFS for all 333 Star Skrumpey tokens.

**Note:** Requires network access to `ipfs-proxy.magiceden.dev`

### For Development/Testing (Static Map Data)
```bash
npm run db:populate-static
```
This populates from the static constellation map (may be inaccurate).

**Warning:** Some tokens may have incorrect constellation data in the static map.

## Verifying the Fixes Work Together

1. Populate database: `npm run db:populate-static`
2. Start dev server: `npm run dev`
3. Test Members page shows correct constellations (Bug #1 fixed)
4. Test Profile page shows gradient text properly (Bug #2 fixed)

## Common Issues

### Issue: Members API returns empty array
**Cause:** No blockchain data available (expected in test environment)
**Solution:** This is normal. The constellation data fix can still be verified via the metadata API.

### Issue: Gradient still shows as bar
**Cause:** Browser cache or CSS not reloading
**Solution:** 
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Clear browser cache
- Check if DevTools is showing the correct HTML structure

### Issue: Database is empty
**Cause:** Database population script not run
**Solution:** Run `npm run db:populate-static`

## Success Criteria

✅ **Bug #1 Fixed:**
- Database contains 333 Star Skrumpey records
- Metadata API returns correct constellations from database
- Members page displays correct constellation names

✅ **Bug #2 Fixed:**
- Constellation text in NFT grid is visible
- Text has gradient coloring applied
- No solid gradient bars replacing text
- `-webkit-background-clip: text` is present in rendered HTML
