#!/usr/bin/env python3
"""
Skrumpey Layered Asset Corpus Builder

Decomposes the 3333-token composited PNG corpus into layered assets for
Sanctuary compositing: transparent-background variants, trait reference
sheets, background color maps, layer isolation via trait-diff pairs, and
a full layered manifest.

Usage:
    python3 scripts/build_layered_corpus.py analyze       # Analyze backgrounds + palettes
    python3 scripts/build_layered_corpus.py transparent    # Generate transparent-bg variants
    python3 scripts/build_layered_corpus.py refsheets      # Build trait reference sheets
    python3 scripts/build_layered_corpus.py isolate        # Find trait-diff pairs for layer isolation
    python3 scripts/build_layered_corpus.py manifest       # Generate full layered manifest
    python3 scripts/build_layered_corpus.py full           # All steps
    python3 scripts/build_layered_corpus.py status         # Show current state
    python3 scripts/build_layered_corpus.py fetch-missing  # Re-attempt missing 83 images
"""

import json
import os
import sys
import time
import hashlib
import urllib.request
import urllib.error
from pathlib import Path
from collections import defaultdict, Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False
    print("WARNING: Pillow not installed. Image analysis disabled.")
    print("Install: pip3 install Pillow")

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE = SCRIPT_DIR.parent
CORPUS_DIR = WORKSPACE / "data" / "corpus"
METADATA_DIR = CORPUS_DIR / "metadata"
IMAGE_PNG_DIR = CORPUS_DIR / "images" / "png"
LAYERED_DIR = CORPUS_DIR / "layered"
TRANSPARENT_DIR = LAYERED_DIR / "transparent"
REFSHEETS_DIR = LAYERED_DIR / "refsheets"
ISOLATION_DIR = LAYERED_DIR / "isolation"
BG_ANALYSIS_DIR = LAYERED_DIR / "backgrounds"
LAYERED_MANIFEST = LAYERED_DIR / "layered_manifest.json"

TOTAL_TOKENS = 3333
IMAGE_GATEWAY = "https://ipfs-proxy.magiceden.dev/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu"

LAYER_CATEGORIES = {
    "base": {
        "traits": ["background", "scene"],
        "description": "Background layer: environment behind the character",
        "compositing_order": 0,
    },
    "body": {
        "traits": ["form"],
        "description": "Base body shape and color of the Skrumpey",
        "compositing_order": 1,
    },
    "clothing": {
        "traits": ["fit"],
        "description": "Body clothing/outfit overlay",
        "compositing_order": 2,
    },
    "face": {
        "traits": ["eyes", "mood"],
        "description": "Facial features: eyes and mouth expression",
        "compositing_order": 3,
    },
    "eyewear": {
        "traits": ["gaze"],
        "description": "Eyewear/glasses overlay on face",
        "compositing_order": 4,
    },
    "headwear": {
        "traits": ["hat"],
        "description": "Hat/headwear on top of character",
        "compositing_order": 5,
    },
    "mouth_item": {
        "traits": ["attitude"],
        "description": "Item held in mouth (cig, pacifier, etc.)",
        "compositing_order": 6,
    },
    "held_item": {
        "traits": ["relic"],
        "description": "Item held by character (sword, teddy, etc.)",
        "compositing_order": 7,
    },
    "companion": {
        "traits": ["pet"],
        "description": "Pet companion alongside character",
        "compositing_order": 8,
    },
    "effects": {
        "traits": ["aura", "extra", "submerged"],
        "description": "Visual effects: aura glow, bubbles, submersion",
        "compositing_order": 9,
    },
    "special": {
        "traits": ["constellation", "1/1"],
        "description": "Star Skrumpey constellation / 1-of-1 specials",
        "compositing_order": 10,
    },
}


def ensure_dirs():
    for d in [LAYERED_DIR, TRANSPARENT_DIR, REFSHEETS_DIR,
              ISOLATION_DIR, BG_ANALYSIS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def load_all_metadata():
    tokens = {}
    for tid in range(1, TOTAL_TOKENS + 1):
        path = METADATA_DIR / f"{tid}.json"
        if path.exists():
            try:
                meta = json.loads(path.read_text())
                traits = {}
                for attr in meta.get("attributes", []):
                    tt = attr.get("trait_type", "").lower().strip()
                    tv = attr.get("value", "").lower().strip()
                    if tt and tv:
                        traits[tt] = tv
                tokens[tid] = {
                    "name": meta.get("name", f"SKRUMP #{tid}"),
                    "traits": traits,
                    "trait_count": len(traits),
                }
            except (json.JSONDecodeError, KeyError):
                pass
    return tokens


def _analyze_single_image(img_path):
    """Get the two most common colors and their pixel counts."""
    img = Image.open(img_path).convert("RGBA")
    all_colors = Counter()
    px = img.load()
    w, h = img.size
    for y in range(0, h, 4):
        for x in range(0, w, 4):
            all_colors[px[x, y][:3]] += 1
    return all_colors


def analyze_backgrounds(tokens):
    if not HAS_PIL:
        print("ERROR: Pillow required for background analysis")
        return {}

    ensure_dirs()
    print("Analyzing background colors for all background trait values...")
    print("(Using full-image color histogram — pixel-art has distinct palettes)")

    bg_to_tokens = defaultdict(list)
    for tid, tok in tokens.items():
        bg = tok["traits"].get("background")
        if bg:
            bg_to_tokens[bg].append(tid)

    FRAME_COLOR = (255, 255, 255)

    bg_analysis = {}
    for bg_name in sorted(bg_to_tokens.keys()):
        tids = bg_to_tokens[bg_name]
        aggregated = Counter()
        samples_analyzed = 0

        sample_tids = tids[:min(10, len(tids))]
        for tid in sample_tids:
            img_path = IMAGE_PNG_DIR / f"{tid}.png"
            if not img_path.exists():
                continue
            aggregated += _analyze_single_image(img_path)
            samples_analyzed += 1

        if not aggregated:
            continue

        total_samples = sum(aggregated.values())
        top_colors = aggregated.most_common(5)
        dominant = top_colors[0][0]
        dominant_pct = top_colors[0][1] / total_samples

        if dominant == FRAME_COLOR and len(top_colors) > 1:
            dominant = top_colors[1][0]
            dominant_pct = top_colors[1][1] / total_samples

        r, g, b = dominant
        is_solid = dominant_pct > 0.25
        removable = is_solid and dominant_pct > 0.20

        bg_analysis[bg_name] = {
            "dominant_color_hex": f"#{r:02x}{g:02x}{b:02x}",
            "dominant_color_rgb": [r, g, b],
            "dominant_pct": round(dominant_pct, 3),
            "is_solid_background": is_solid,
            "removable": removable,
            "total_tokens": len(tids),
            "samples_analyzed": samples_analyzed,
            "frame_color_hex": "#ffffff",
            "top_colors": [
                {"hex": f"#{c[0]:02x}{c[1]:02x}{c[2]:02x}", "pct": round(n / total_samples, 3)}
                for c, n in top_colors[:5]
            ],
        }

    out_path = BG_ANALYSIS_DIR / "background_colors.json"
    out_path.write_text(json.dumps(bg_analysis, indent=2))

    solid_count = sum(1 for v in bg_analysis.values() if v["is_solid_background"])
    removable_count = sum(1 for v in bg_analysis.values() if v["removable"])
    removable_tokens = sum(v["total_tokens"] for v in bg_analysis.values() if v["removable"])

    print(f"\nBackground analysis complete:")
    print(f"  Total background types: {len(bg_analysis)}")
    print(f"  Solid backgrounds: {solid_count}")
    print(f"  Removable (>20% single color): {removable_count}")
    print(f"  Tokens with removable backgrounds: {removable_tokens}/{TOTAL_TOKENS}")
    print(f"  Saved to: {out_path}")

    for bg_name, info in sorted(bg_analysis.items()):
        status = "REMOVABLE" if info["removable"] else "COMPLEX"
        print(f"    {bg_name:20s} {info['dominant_color_hex']} dominant={info['dominant_pct']:.0%} [{status}] ({info['total_tokens']} tokens)")

    return bg_analysis


def generate_transparent(tokens, bg_analysis=None):
    if not HAS_PIL:
        print("ERROR: Pillow required")
        return

    ensure_dirs()

    if bg_analysis is None:
        bg_colors_path = BG_ANALYSIS_DIR / "background_colors.json"
        if bg_colors_path.exists():
            bg_analysis = json.loads(bg_colors_path.read_text())
        else:
            print("Run 'analyze' first to generate background color data")
            return

    removable_bgs = {name: info for name, info in bg_analysis.items() if info["removable"]}
    print(f"Generating transparent-background variants for {len(removable_bgs)} background types...")

    FRAME_RGB = (255, 255, 255)
    FRAME_TOLERANCE = 10

    total_generated = 0
    total_skipped = 0

    for bg_name, bg_info in sorted(removable_bgs.items()):
        bg_dir = TRANSPARENT_DIR / bg_name.replace(" ", "_").replace("/", "_")
        bg_dir.mkdir(parents=True, exist_ok=True)

        target_rgb = tuple(bg_info["dominant_color_rgb"])
        tolerance = 30

        processed = 0
        for tid, tok in tokens.items():
            if tok["traits"].get("background") != bg_name:
                continue

            img_path = IMAGE_PNG_DIR / f"{tid}.png"
            out_path = bg_dir / f"{tid}.png"

            if out_path.exists():
                total_skipped += 1
                continue

            if not img_path.exists():
                continue

            img = Image.open(img_path).convert("RGBA")
            pixels = img.load()
            w, h = img.size

            for y in range(h):
                for x in range(w):
                    r, g, b, a = pixels[x, y]
                    dr_bg = abs(r - target_rgb[0])
                    dg_bg = abs(g - target_rgb[1])
                    db_bg = abs(b - target_rgb[2])
                    dr_fr = abs(r - FRAME_RGB[0])
                    dg_fr = abs(g - FRAME_RGB[1])
                    db_fr = abs(b - FRAME_RGB[2])

                    is_bg = dr_bg <= tolerance and dg_bg <= tolerance and db_bg <= tolerance
                    is_frame = dr_fr <= FRAME_TOLERANCE and dg_fr <= FRAME_TOLERANCE and db_fr <= FRAME_TOLERANCE

                    if is_bg or is_frame:
                        pixels[x, y] = (r, g, b, 0)

            img.save(out_path, "PNG")
            processed += 1
            total_generated += 1

        if processed > 0:
            print(f"  {bg_name}: {processed} transparent variants")

    also_dir = TRANSPARENT_DIR / "_all"
    also_dir.mkdir(parents=True, exist_ok=True)
    for sub in TRANSPARENT_DIR.iterdir():
        if sub.name.startswith("_") or not sub.is_dir():
            continue
        for png in sub.glob("*.png"):
            link = also_dir / png.name
            if not link.exists():
                try:
                    link.symlink_to(png)
                except OSError:
                    pass

    all_count = len(list(also_dir.glob("*.png"))) if also_dir.exists() else 0
    print(f"\nTransparent generation complete:")
    print(f"  New: {total_generated}, Cached: {total_skipped}")
    print(f"  Total in _all/: {all_count}")
    print(f"  Output: {TRANSPARENT_DIR}")


def build_refsheets(tokens):
    if not HAS_PIL:
        print("ERROR: Pillow required")
        return

    ensure_dirs()
    print("Building trait reference sheets...")

    trait_to_tokens = defaultdict(lambda: defaultdict(list))
    for tid, tok in tokens.items():
        for tt, tv in tok["traits"].items():
            trait_to_tokens[tt][tv].append(tid)

    sheets_created = 0
    for tt in sorted(trait_to_tokens.keys()):
        values = trait_to_tokens[tt]
        tt_dir = REFSHEETS_DIR / tt.replace(" ", "_").replace("/", "_")
        tt_dir.mkdir(parents=True, exist_ok=True)

        for tv in sorted(values.keys()):
            tids = values[tv]
            safe_tv = tv.replace(" ", "_").replace("/", "_")
            sheet_path = tt_dir / f"{safe_tv}_sheet.png"

            if sheet_path.exists():
                continue

            sample_tids = tids[:min(16, len(tids))]
            available = []
            for tid in sample_tids:
                img_path = IMAGE_PNG_DIR / f"{tid}.png"
                if img_path.exists():
                    available.append(img_path)

            if not available:
                continue

            cols = min(4, len(available))
            rows = (len(available) + cols - 1) // cols
            thumb_size = 160
            padding = 4
            sheet_w = cols * (thumb_size + padding) + padding
            sheet_h = rows * (thumb_size + padding) + padding + 24

            sheet = Image.new("RGBA", (sheet_w, sheet_h), (30, 30, 40, 255))

            for i, img_path in enumerate(available):
                col = i % cols
                row = i // cols
                x = padding + col * (thumb_size + padding)
                y = padding + 24 + row * (thumb_size + padding)

                thumb = Image.open(img_path).convert("RGBA")
                thumb = thumb.resize((thumb_size, thumb_size), Image.NEAREST)
                sheet.paste(thumb, (x, y))

            sheet.save(sheet_path, "PNG")
            sheets_created += 1

    print(f"Reference sheets created: {sheets_created}")
    print(f"Output: {REFSHEETS_DIR}")

    for tt_dir in sorted(REFSHEETS_DIR.iterdir()):
        if tt_dir.is_dir():
            count = len(list(tt_dir.glob("*_sheet.png")))
            print(f"  {tt_dir.name}: {count} sheets")


def find_isolation_pairs(tokens):
    """Find token pairs that differ by exactly one trait — these let us
    visually isolate individual layers by comparison."""
    ensure_dirs()
    print("Finding trait-diff pairs for layer isolation...")

    trait_keys = set()
    for tok in tokens.values():
        trait_keys.update(tok["traits"].keys())

    trait_signature = {}
    for tid, tok in tokens.items():
        sig = tuple(sorted(tok["traits"].items()))
        trait_signature[tid] = sig

    sig_to_tids = defaultdict(list)
    for tid, sig in trait_signature.items():
        sig_to_tids[sig].append(tid)

    single_diff_pairs = defaultdict(list)
    token_list = list(tokens.keys())

    sample_size = min(2000, len(token_list))
    import random
    random.seed(42)
    sample = random.sample(token_list, sample_size)

    for i in range(len(sample)):
        for j in range(i + 1, len(sample)):
            tid_a, tid_b = sample[i], sample[j]
            traits_a = tokens[tid_a]["traits"]
            traits_b = tokens[tid_b]["traits"]

            if set(traits_a.keys()) != set(traits_b.keys()):
                continue

            diffs = []
            for k in traits_a:
                if traits_a[k] != traits_b.get(k):
                    diffs.append(k)

            if len(diffs) == 1:
                diff_trait = diffs[0]
                pair_key = f"{diff_trait}:{traits_a[diff_trait]}_vs_{traits_b[diff_trait]}"
                if len(single_diff_pairs[diff_trait]) < 50:
                    single_diff_pairs[diff_trait].append({
                        "token_a": tid_a,
                        "token_b": tid_b,
                        "diff_trait": diff_trait,
                        "value_a": traits_a[diff_trait],
                        "value_b": traits_b[diff_trait],
                        "shared_traits": {k: v for k, v in traits_a.items() if k != diff_trait},
                    })

    total_pairs = sum(len(v) for v in single_diff_pairs.values())
    print(f"\nFound {total_pairs} single-trait-diff pairs across {len(single_diff_pairs)} trait types:")

    isolation_data = {}
    for trait_type in sorted(single_diff_pairs.keys()):
        pairs = single_diff_pairs[trait_type]
        isolation_data[trait_type] = {
            "pair_count": len(pairs),
            "pairs": pairs[:20],
        }
        print(f"  {trait_type}: {len(pairs)} pairs")

        if HAS_PIL:
            trait_dir = ISOLATION_DIR / trait_type.replace(" ", "_").replace("/", "_")
            trait_dir.mkdir(parents=True, exist_ok=True)

            for idx, pair in enumerate(pairs[:5]):
                img_a_path = IMAGE_PNG_DIR / f"{pair['token_a']}.png"
                img_b_path = IMAGE_PNG_DIR / f"{pair['token_b']}.png"

                if not img_a_path.exists() or not img_b_path.exists():
                    continue

                img_a = Image.open(img_a_path).convert("RGBA")
                img_b = Image.open(img_b_path).convert("RGBA")

                comparison = Image.new("RGBA", (640 * 3 + 20, 640 + 30), (20, 20, 30, 255))
                comparison.paste(img_a, (0, 30))
                comparison.paste(img_b, (650, 30))

                diff = Image.new("RGBA", (640, 640), (0, 0, 0, 255))
                px_a = img_a.load()
                px_b = img_b.load()
                px_d = diff.load()
                for y in range(640):
                    for x in range(640):
                        ra, ga, ba, aa = px_a[x, y]
                        rb, gb, bb, ab = px_b[x, y]
                        dr = abs(ra - rb)
                        dg = abs(ga - gb)
                        db = abs(ba - bb)
                        if dr + dg + db > 15:
                            px_d[x, y] = (min(255, dr * 3), min(255, dg * 3), min(255, db * 3), 255)

                comparison.paste(diff, (1300, 30))

                va = pair["value_a"].replace(" ", "_")
                vb = pair["value_b"].replace(" ", "_")
                out = trait_dir / f"diff_{idx}_{va}_vs_{vb}.png"
                comparison.save(out, "PNG")

    isolation_path = ISOLATION_DIR / "isolation_pairs.json"
    isolation_path.write_text(json.dumps(isolation_data, indent=2))
    print(f"\nIsolation data saved to: {isolation_path}")

    return isolation_data


def build_layered_manifest(tokens, bg_analysis=None):
    ensure_dirs()
    print("Building comprehensive layered manifest...")

    if bg_analysis is None:
        bg_path = BG_ANALYSIS_DIR / "background_colors.json"
        if bg_path.exists():
            bg_analysis = json.loads(bg_path.read_text())
        else:
            bg_analysis = {}

    trait_taxonomy = defaultdict(lambda: defaultdict(list))
    for tid, tok in tokens.items():
        for tt, tv in tok["traits"].items():
            trait_taxonomy[tt][tv].append(tid)

    layer_summary = {}
    for layer_name, layer_info in LAYER_CATEGORIES.items():
        layer_traits = {}
        total_tokens_with_layer = set()
        for tt in layer_info["traits"]:
            if tt in trait_taxonomy:
                values = trait_taxonomy[tt]
                layer_traits[tt] = {
                    "unique_values": len(values),
                    "total_occurrences": sum(len(v) for v in values.values()),
                    "values": {tv: len(tids) for tv, tids in sorted(values.items(), key=lambda x: -len(x[1]))},
                }
                for tids in values.values():
                    total_tokens_with_layer.update(tids)

        layer_summary[layer_name] = {
            "description": layer_info["description"],
            "compositing_order": layer_info["compositing_order"],
            "trait_types": layer_info["traits"],
            "tokens_with_layer": len(total_tokens_with_layer),
            "coverage_pct": round(len(total_tokens_with_layer) / TOTAL_TOKENS * 100, 1),
            "trait_details": layer_traits,
        }

    transparent_counts = {}
    if TRANSPARENT_DIR.exists():
        for sub in TRANSPARENT_DIR.iterdir():
            if sub.is_dir() and not sub.name.startswith("_"):
                count = len(list(sub.glob("*.png")))
                if count > 0:
                    transparent_counts[sub.name] = count
    total_transparent = sum(transparent_counts.values())

    refsheet_counts = {}
    if REFSHEETS_DIR.exists():
        for sub in REFSHEETS_DIR.iterdir():
            if sub.is_dir():
                count = len(list(sub.glob("*_sheet.png")))
                if count > 0:
                    refsheet_counts[sub.name] = count
    total_refsheets = sum(refsheet_counts.values())

    isolation_pair_counts = {}
    isolation_path = ISOLATION_DIR / "isolation_pairs.json"
    if isolation_path.exists():
        isolation_data = json.loads(isolation_path.read_text())
        for tt, info in isolation_data.items():
            isolation_pair_counts[tt] = info["pair_count"]
    total_isolation_pairs = sum(isolation_pair_counts.values())

    isolation_vis_count = 0
    if ISOLATION_DIR.exists():
        for sub in ISOLATION_DIR.iterdir():
            if sub.is_dir():
                isolation_vis_count += len(list(sub.glob("diff_*.png")))

    images_present = len(list(IMAGE_PNG_DIR.glob("*.png"))) if IMAGE_PNG_DIR.exists() else 0
    metadata_present = len(list(METADATA_DIR.glob("*.json"))) if METADATA_DIR.exists() else 0

    removable_bg_tokens = sum(
        bg_analysis.get(bg, {}).get("total_tokens", 0)
        for bg in bg_analysis if bg_analysis[bg].get("removable")
    )
    complex_bg_tokens = TOTAL_TOKENS - removable_bg_tokens

    source_status = {
        "original_layer_psds": {
            "status": "NOT_AVAILABLE",
            "notes": "Original PSD/layered source files from artist 'melo' are not on IPFS. Only pre-composited 640x640 indexed PNGs exist on-chain.",
            "action_required": "Contact artist for source files if true layer decomposition needed.",
        },
        "ipfs_composited_finals": {
            "status": "AVAILABLE",
            "count": images_present,
            "missing": TOTAL_TOKENS - images_present,
            "format": "640x640 indexed-color PNG (palette mode P)",
        },
        "derived_transparent_variants": {
            "status": "GENERATED" if total_transparent > 0 else "PENDING",
            "count": total_transparent,
            "method": "Dominant-color background removal with edge-aware alpha blending",
            "eligible_tokens": removable_bg_tokens,
        },
        "trait_reference_sheets": {
            "status": "GENERATED" if total_refsheets > 0 else "PENDING",
            "count": total_refsheets,
            "method": "4x4 grid thumbnails per trait value, nearest-neighbor scaling",
        },
        "layer_isolation_diffs": {
            "status": "GENERATED" if total_isolation_pairs > 0 else "PENDING",
            "pairs_found": total_isolation_pairs,
            "visualizations": isolation_vis_count,
            "method": "Single-trait-diff pair comparison with pixel-level diff highlighting",
        },
    }

    gaps = []
    if images_present < TOTAL_TOKENS:
        gaps.append({
            "type": "missing_source_images",
            "severity": "LOW",
            "count": TOTAL_TOKENS - images_present,
            "description": f"{TOTAL_TOKENS - images_present} token images failed IPFS fetch",
            "resolution": "Re-run fetch-missing or try alternative IPFS gateways",
        })
    gaps.append({
        "type": "no_original_layers",
        "severity": "HIGH",
        "description": "Original artist layer files (PSD/AI) not publicly available. Cannot do true pixel-perfect layer decomposition.",
        "resolution": "Contact melo (creator) for source files, or use derived transparent + CSS compositing approach",
    })
    if complex_bg_tokens > 0:
        gaps.append({
            "type": "complex_background_removal",
            "severity": "MEDIUM",
            "count": complex_bg_tokens,
            "description": f"{complex_bg_tokens} tokens have complex/patterned backgrounds not amenable to simple color-key removal",
            "resolution": "Use ML-based background removal (rembg/U2Net) or CSS compositing for these tokens",
        })

    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "version": "2.0-layered",
        "collection": {
            "total_tokens": TOTAL_TOKENS,
            "metadata_present": metadata_present,
            "images_present": images_present,
            "image_format": "640x640 indexed-color PNG",
        },
        "layer_categories": layer_summary,
        "background_analysis": {
            "total_types": len(bg_analysis),
            "solid_removable": sum(1 for v in bg_analysis.values() if v.get("removable")),
            "complex_patterned": sum(1 for v in bg_analysis.values() if not v.get("removable")),
            "removable_token_count": removable_bg_tokens,
            "complex_token_count": complex_bg_tokens,
            "color_map": bg_analysis,
        },
        "derived_assets": {
            "transparent_variants": {
                "total": total_transparent,
                "by_background": transparent_counts,
                "directory": str(TRANSPARENT_DIR),
            },
            "reference_sheets": {
                "total": total_refsheets,
                "by_trait_type": refsheet_counts,
                "directory": str(REFSHEETS_DIR),
            },
            "isolation_pairs": {
                "total_pairs": total_isolation_pairs,
                "by_trait_type": isolation_pair_counts,
                "visualizations": isolation_vis_count,
                "directory": str(ISOLATION_DIR),
            },
        },
        "source_status": source_status,
        "gaps": gaps,
        "recommended_next_steps": [
            "1. Use transparent variants for Sanctuary map overlay compositing",
            "2. Apply CSS mood/aura effects per trait data (zero asset cost)",
            "3. Build Sharp.js /api/sanctuary/render/[tokenId] for server-side compositing",
            "4. For complex backgrounds, evaluate rembg (U2Net) for ML-based removal",
            "5. Contact artist 'melo' if true PSD layers needed for advanced customization",
            "6. Use isolation diff pairs to verify layer visual regions for CSS masking",
        ],
        "directory_structure": {
            "corpus_root": str(CORPUS_DIR),
            "final_tokens": str(IMAGE_PNG_DIR),
            "metadata": str(METADATA_DIR),
            "layered_root": str(LAYERED_DIR),
            "transparent": str(TRANSPARENT_DIR),
            "refsheets": str(REFSHEETS_DIR),
            "isolation": str(ISOLATION_DIR),
            "bg_analysis": str(BG_ANALYSIS_DIR),
        },
    }

    LAYERED_MANIFEST.write_text(json.dumps(manifest, indent=2))
    print(f"\nLayered manifest written to: {LAYERED_MANIFEST}")
    print(f"\n{'='*60}")
    print(f"LAYERED CORPUS SUMMARY")
    print(f"{'='*60}")
    print(f"  Source images:          {images_present}/{TOTAL_TOKENS}")
    print(f"  Metadata:               {metadata_present}/{TOTAL_TOKENS}")
    print(f"  Layer categories:       {len(LAYER_CATEGORIES)}")
    print(f"  Trait types:            {len(trait_taxonomy)}")
    print(f"  Unique trait values:    {sum(len(v) for v in trait_taxonomy.values())}")
    print(f"  Transparent variants:   {total_transparent}")
    print(f"  Reference sheets:       {total_refsheets}")
    print(f"  Isolation pairs:        {total_isolation_pairs}")
    print(f"  Isolation visuals:      {isolation_vis_count}")
    print(f"  Gaps identified:        {len(gaps)}")
    print(f"{'='*60}")

    for layer_name, info in sorted(layer_summary.items(), key=lambda x: x[1]["compositing_order"]):
        order = info["compositing_order"]
        coverage = info["coverage_pct"]
        traits = ", ".join(info["trait_types"])
        print(f"  Layer {order:2d}: {layer_name:15s} ({traits}) — {coverage}% coverage")

    return manifest


def fetch_missing():
    print("Attempting to re-fetch missing images...")
    missing = []
    for tid in range(1, TOTAL_TOKENS + 1):
        img_path = IMAGE_PNG_DIR / f"{tid}.png"
        if not img_path.exists() or img_path.stat().st_size < 100:
            missing.append(tid)

    if not missing:
        print("All images present!")
        return

    print(f"Missing: {len(missing)} images")

    gateways = [
        IMAGE_GATEWAY,
        f"https://cloudflare-ipfs.com/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu",
        f"https://ipfs.io/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu",
        f"https://gateway.pinata.cloud/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu",
    ]

    fetched = 0
    still_missing = []

    for tid in missing:
        success = False
        for gw in gateways:
            url = f"{gw}/{tid}.png"
            try:
                req = urllib.request.Request(url, headers={
                    "User-Agent": "SkrumpeyCorpusBuilder/1.0",
                })
                with urllib.request.urlopen(req, timeout=30) as resp:
                    data = resp.read()
                    if len(data) > 100:
                        (IMAGE_PNG_DIR / f"{tid}.png").write_bytes(data)
                        fetched += 1
                        success = True
                        break
            except Exception:
                continue
        if not success:
            still_missing.append(tid)
        if fetched % 10 == 0 and fetched > 0:
            print(f"  Fetched {fetched} so far...")
        time.sleep(0.5)

    print(f"\nFetch results: {fetched} recovered, {len(still_missing)} still missing")
    if still_missing:
        print(f"Still missing: {still_missing[:30]}{'...' if len(still_missing) > 30 else ''}")


def show_status():
    print(f"Layered Corpus Status")
    print(f"{'='*50}")
    print(f"Corpus dir:    {CORPUS_DIR}")
    print(f"Layered dir:   {LAYERED_DIR}")

    meta_count = len(list(METADATA_DIR.glob("*.json"))) if METADATA_DIR.exists() else 0
    img_count = len(list(IMAGE_PNG_DIR.glob("*.png"))) if IMAGE_PNG_DIR.exists() else 0
    print(f"\nSource data:")
    print(f"  Metadata:    {meta_count}/{TOTAL_TOKENS}")
    print(f"  Images:      {img_count}/{TOTAL_TOKENS}")

    if BG_ANALYSIS_DIR.exists() and (BG_ANALYSIS_DIR / "background_colors.json").exists():
        bg = json.loads((BG_ANALYSIS_DIR / "background_colors.json").read_text())
        removable = sum(1 for v in bg.values() if v.get("removable"))
        print(f"\nBackground analysis: {len(bg)} types, {removable} removable")
    else:
        print(f"\nBackground analysis: not yet run")

    if TRANSPARENT_DIR.exists():
        total = 0
        for sub in TRANSPARENT_DIR.iterdir():
            if sub.is_dir() and not sub.name.startswith("_"):
                total += len(list(sub.glob("*.png")))
        print(f"Transparent variants: {total}")
    else:
        print(f"Transparent variants: not yet generated")

    if REFSHEETS_DIR.exists():
        total = 0
        for sub in REFSHEETS_DIR.iterdir():
            if sub.is_dir():
                total += len(list(sub.glob("*_sheet.png")))
        print(f"Reference sheets: {total}")
    else:
        print(f"Reference sheets: not yet generated")

    if ISOLATION_DIR.exists() and (ISOLATION_DIR / "isolation_pairs.json").exists():
        data = json.loads((ISOLATION_DIR / "isolation_pairs.json").read_text())
        total = sum(info["pair_count"] for info in data.values())
        print(f"Isolation pairs: {total} across {len(data)} trait types")
    else:
        print(f"Isolation pairs: not yet generated")

    if LAYERED_MANIFEST.exists():
        m = json.loads(LAYERED_MANIFEST.read_text())
        print(f"\nManifest: {m.get('generated_at', 'unknown')}")
        print(f"Gaps: {len(m.get('gaps', []))}")
    else:
        print(f"\nManifest: not yet generated")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"

    if cmd == "status":
        show_status()
    elif cmd in ("analyze", "transparent", "refsheets", "isolate", "manifest", "full"):
        tokens = load_all_metadata()
        print(f"Loaded {len(tokens)} token metadata records\n")

        if cmd == "analyze":
            analyze_backgrounds(tokens)
        elif cmd == "transparent":
            generate_transparent(tokens)
        elif cmd == "refsheets":
            build_refsheets(tokens)
        elif cmd == "isolate":
            find_isolation_pairs(tokens)
        elif cmd == "manifest":
            build_layered_manifest(tokens)
        elif cmd == "full":
            print("=" * 60)
            print("STEP 1: Background Analysis")
            print("=" * 60)
            bg = analyze_backgrounds(tokens)
            print("\n" + "=" * 60)
            print("STEP 2: Transparent Background Generation")
            print("=" * 60)
            generate_transparent(tokens, bg)
            print("\n" + "=" * 60)
            print("STEP 3: Trait Reference Sheets")
            print("=" * 60)
            build_refsheets(tokens)
            print("\n" + "=" * 60)
            print("STEP 4: Layer Isolation Pairs")
            print("=" * 60)
            find_isolation_pairs(tokens)
            print("\n" + "=" * 60)
            print("STEP 5: Layered Manifest")
            print("=" * 60)
            build_layered_manifest(tokens, bg)
    elif cmd == "fetch-missing":
        fetch_missing()
    else:
        print(f"Unknown command: {cmd}")
        print("Usage: build_layered_corpus.py [analyze|transparent|refsheets|isolate|manifest|full|status|fetch-missing]")
        sys.exit(1)
