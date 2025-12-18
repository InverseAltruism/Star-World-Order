# SWO Branding Images

This folder contains branding images for Star World Order.

## Current Files (SVG Placeholders)

The repository includes SVG placeholder files that will display until you copy the actual PNG files:
- `SWO_Star.svg` - Placeholder star logo
- `Purple_skrumpey.svg` - Placeholder purple skrumpey
- `str_mon2.svg` - Placeholder star monflare

## Required PNG Files

Copy these files from `/opt/star_world_order/SWO_Images/` on the NUC server:

| File | Description | Used In |
|------|-------------|---------|
| `SWO_Star.png` | Main SWO star logo | Header logo, favicon, loading screen |
| `Purple_skrumpey.png` | Purple Skrumpey character | Features section (replaces frog) |
| `str_mon2.png` | Star Monflare character | Features section (replaces star emoji) |

## Copy Command (run on NUC)

```bash
# For DEV environment
cp /opt/star_world_order/SWO_Images/SWO_Star.png /opt/star_world_order/DEV/Star-World-Order/public/images/
cp /opt/star_world_order/SWO_Images/Purple_skrumpey.png /opt/star_world_order/DEV/Star-World-Order/public/images/
cp /opt/star_world_order/SWO_Images/str_mon2.png /opt/star_world_order/DEV/Star-World-Order/public/images/
```

## For Production

```bash
cp /opt/star_world_order/SWO_Images/SWO_Star.png /opt/star_world_order/PROD/Star-World-Order/public/images/
cp /opt/star_world_order/SWO_Images/Purple_skrumpey.png /opt/star_world_order/PROD/Star-World-Order/public/images/
cp /opt/star_world_order/SWO_Images/str_mon2.png /opt/star_world_order/PROD/Star-World-Order/public/images/
```

## Switching to PNG Files

Once you've copied the PNG files, update the image references in the following files to use `.png` instead of `.svg`:

1. `components/Header.tsx` - Change `SWO_Star.svg` to `SWO_Star.png`
2. `components/Hero.tsx` - Change `Purple_skrumpey.svg` and `str_mon2.svg` to `.png`
3. `components/LoadingScreen.tsx` - Change `SWO_Star.svg` to `SWO_Star.png`

## Favicon

The `app/icon.svg` file is used as the browser tab icon (favicon). To use the SWO_Star.png instead:

```bash
# Copy and rename to icon.png (Next.js will auto-detect)
cp /opt/star_world_order/SWO_Images/SWO_Star.png /opt/star_world_order/DEV/Star-World-Order/app/icon.png
cp /opt/star_world_order/SWO_Images/SWO_Star.png /opt/star_world_order/PROD/Star-World-Order/app/icon.png

# Then remove the SVG version
rm app/icon.svg
```
