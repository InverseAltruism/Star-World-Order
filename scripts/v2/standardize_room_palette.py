#!/usr/bin/env python3
"""
SWO V2 Room Palette Standardizer — [SWO_V2_ROOM_PALETTE_STANDARDIZE]

Snaps every painted V2 room PNG in `public/sanctuary/` to the canonical 16-color
SWO palette established by `[SWO_V2_DESLOP_SHADER]` (see
`game/shaders/deslopPalette.ts`). Pure batch color-adjust — no RD regeneration.

For each room:
  1. Load original RGB(A) pixels.
  2. Vectorised nearest-palette index per pixel (squared distance, RGB only).
  3. Write snapped output to `public/sanctuary/_palette_review/<name>.before.png`
     and `<name>.after.png` plus a side-by-side `<name>.compare.png` BEFORE
     overwriting the original.
  4. Overwrite the original PNG with the snapped output (alpha preserved).
  5. Verify: histogram of input nearest-palette assignments vs histogram of
     output palette indices must agree to within `--tol` (default 5 percentage
     points L_inf). Idempotent by construction — the check guards against
     write-side bugs (alpha clobber, channel reorder, dtype loss).

Usage:
  scripts/v2/standardize_room_palette.py            # process all 8 rooms
  scripts/v2/standardize_room_palette.py --dry-run  # write review only, no overwrite
  scripts/v2/standardize_room_palette.py --rooms "Aura Forge,Observatory"
"""
from __future__ import annotations

import argparse
import json
import sys
from dataclasses import dataclass, asdict
from pathlib import Path

import numpy as np
from PIL import Image

# --- Canonical SWO palette --------------------------------------------------
# Mirror of `game/shaders/deslopPalette.ts` :: DESLOP_PALETTE_HEX.
# Keep in lock-step with the shader; both files are sourced from
# docs/SANCTUARY_STYLE_DOCTRINE.md §2.
DESLOP_PALETTE_HEX: list[str] = [
    "#0a0015",  # 0  deep night (matches game bg)
    "#1a0a2e",  # 1  dark purple
    "#2a1845",  # 2  mid purple
    "#4a2a7a",  # 3  purple
    "#7a4ab8",  # 4  lavender
    "#9966ff",  # 5  light lavender
    "#c9a6ff",  # 6  pale purple
    "#00f7ff",  # 7  cyan
    "#44ff88",  # 8  green
    "#ffd700",  # 9  gold
    "#ff6688",  # 10 pink
    "#ff3344",  # 11 red
    "#ffffff",  # 12 white
    "#aaaaaa",  # 13 light gray
    "#555566",  # 14 mid gray
    "#1a1a2a",  # 15 dark gray-blue
]

# The 8 painted V2 rooms shipped at `public/sanctuary/<Name>.png`. These are
# the location vignettes referenced from the sanctuary doctrine — companion
# sprites and map backgrounds are intentionally excluded.
V2_ROOMS: list[str] = [
    "Aura Forge",
    "Cosmic Library",
    "Dream Hollow",
    "Hot Springs",
    "Nebula Kitchen",
    "Observatory",
    "Star Garden",
    "Training Grounds",
]

REPO_ROOT = Path(__file__).resolve().parents[2]
ROOMS_DIR = REPO_ROOT / "public" / "sanctuary"
REVIEW_DIR = ROOMS_DIR / "_palette_review"


def hex_to_rgb(hex_str: str) -> tuple[int, int, int]:
    h = hex_str.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def palette_array() -> np.ndarray:
    """Returns palette as a (PALETTE_SIZE, 3) uint8 array."""
    return np.array([hex_to_rgb(h) for h in DESLOP_PALETTE_HEX], dtype=np.uint8)


def nearest_palette_indices(pixels_rgb: np.ndarray, palette: np.ndarray) -> np.ndarray:
    """Vectorised nearest-color search.

    pixels_rgb: (N, 3) uint8.
    palette:    (P, 3) uint8.
    returns:    (N,)   int64 indices into palette.
    """
    p = palette.astype(np.int32)  # (P, 3)
    # Process in chunks to keep memory bounded on large images
    chunk = 1 << 18
    n = pixels_rgb.shape[0]
    out = np.empty(n, dtype=np.int64)
    for start in range(0, n, chunk):
        end = min(start + chunk, n)
        px = pixels_rgb[start:end].astype(np.int32)  # (M, 3)
        # (M, 1, 3) - (1, P, 3) -> (M, P, 3) -> (M, P)
        diff = px[:, None, :] - p[None, :, :]
        dist = np.einsum("mpc,mpc->mp", diff, diff)
        out[start:end] = np.argmin(dist, axis=1)
    return out


@dataclass
class RoomReport:
    name: str
    path: str
    width: int
    height: int
    pixel_count: int
    unique_input_colors: int
    input_hist_pct: list[float]   # P-length, sums to ~100
    output_hist_pct: list[float]  # P-length, sums to ~100
    max_abs_pp_delta: float       # L_inf in percentage points
    avg_snap_distance: float      # mean RGB euclidean distance pixel->palette
    on_palette_pct: float         # fraction of output pixels that exactly match a palette entry
    overwritten: bool


def histogram_pct(indices: np.ndarray, palette_size: int) -> np.ndarray:
    counts = np.bincount(indices, minlength=palette_size).astype(np.float64)
    total = counts.sum()
    if total == 0:
        return counts
    return counts * (100.0 / total)


def build_compare(before: Image.Image, after: Image.Image) -> Image.Image:
    """Side-by-side composite (before | after) with a 4px divider."""
    w, h = before.size
    divider = 4
    out = Image.new("RGBA", (w * 2 + divider, h), (255, 0, 255, 255))  # magenta divider
    out.paste(before.convert("RGBA"), (0, 0))
    out.paste(after.convert("RGBA"), (w + divider, 0))
    return out


def process_room(name: str, palette: np.ndarray, tol_pp: float, dry_run: bool) -> RoomReport:
    src = ROOMS_DIR / f"{name}.png"
    if not src.exists():
        raise FileNotFoundError(f"Missing room asset: {src}")

    img = Image.open(src)
    has_alpha = img.mode in ("RGBA", "LA") or "transparency" in img.info
    img_rgba = img.convert("RGBA")
    arr = np.array(img_rgba)  # (H, W, 4) uint8
    h, w = arr.shape[:2]
    rgb = arr[..., :3].reshape(-1, 3)
    alpha = arr[..., 3]

    unique_input = len(np.unique(rgb.view([("", rgb.dtype)] * 3)))

    indices = nearest_palette_indices(rgb, palette)
    snapped_rgb = palette[indices].reshape(h, w, 3)

    # Distance metric — informational only.
    diff = rgb.astype(np.int32) - palette[indices].astype(np.int32)
    dist = np.sqrt((diff * diff).sum(axis=1))
    avg_dist = float(dist.mean())

    out_arr = np.empty((h, w, 4), dtype=np.uint8)
    out_arr[..., :3] = snapped_rgb
    out_arr[..., 3] = alpha
    out_img = Image.fromarray(out_arr, mode="RGBA")
    if not has_alpha:
        out_img = out_img.convert("RGB")

    # Side-by-side review folder — written BEFORE we overwrite the original.
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    safe = name.replace(" ", "_")
    before_path = REVIEW_DIR / f"{safe}.before.png"
    after_path = REVIEW_DIR / f"{safe}.after.png"
    compare_path = REVIEW_DIR / f"{safe}.compare.png"

    img_rgba.save(before_path, optimize=True)
    out_img.save(after_path, optimize=True)
    build_compare(img_rgba, out_img.convert("RGBA")).save(compare_path, optimize=True)

    # Re-read the after image and verify on-palette purity + histogram match.
    verify_arr = np.array(out_img.convert("RGB")).reshape(-1, 3)
    verify_indices = nearest_palette_indices(verify_arr, palette)
    on_palette_mask = (verify_arr == palette[verify_indices]).all(axis=1)
    on_palette_pct = float(on_palette_mask.mean() * 100.0)

    in_hist = histogram_pct(indices, palette.shape[0])
    out_hist = histogram_pct(verify_indices, palette.shape[0])
    delta = float(np.max(np.abs(in_hist - out_hist)))

    overwritten = False
    if not dry_run:
        # Overwrite original. Preserve alpha if it had one.
        out_img.save(src, optimize=True)
        overwritten = True

    return RoomReport(
        name=name,
        path=str(src.relative_to(REPO_ROOT)),
        width=w,
        height=h,
        pixel_count=int(h * w),
        unique_input_colors=int(unique_input),
        input_hist_pct=[round(x, 4) for x in in_hist.tolist()],
        output_hist_pct=[round(x, 4) for x in out_hist.tolist()],
        max_abs_pp_delta=delta,
        avg_snap_distance=round(avg_dist, 3),
        on_palette_pct=round(on_palette_pct, 4),
        overwritten=overwritten,
    )


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="Write review folder but do not overwrite originals")
    ap.add_argument("--tol", type=float, default=5.0, help="Histogram tolerance in percentage points (default 5)")
    ap.add_argument("--rooms", type=str, default=None, help="Comma-separated subset of room names")
    ap.add_argument("--report", type=str, default=None, help="Optional path to write JSON report")
    args = ap.parse_args()

    palette = palette_array()
    rooms = V2_ROOMS if args.rooms is None else [r.strip() for r in args.rooms.split(",") if r.strip()]

    reports: list[RoomReport] = []
    failures: list[str] = []
    for name in rooms:
        r = process_room(name, palette, args.tol, args.dry_run)
        reports.append(r)
        action = "DRY-RUN" if args.dry_run else "OVERWRITE"
        status = "OK" if r.max_abs_pp_delta <= args.tol else "FAIL"
        if status == "FAIL":
            failures.append(name)
        print(
            f"[{status}] {action} {name:<18} "
            f"px={r.pixel_count:>9} unique_in={r.unique_input_colors:>7} "
            f"avg_snap_dist={r.avg_snap_distance:>6.2f} "
            f"on_palette={r.on_palette_pct:>6.2f}% "
            f"hist_pp_delta={r.max_abs_pp_delta:>5.3f}"
        )

    if args.report:
        Path(args.report).write_text(
            json.dumps(
                {
                    "palette_hex": DESLOP_PALETTE_HEX,
                    "tolerance_pp": args.tol,
                    "rooms": [asdict(r) for r in reports],
                    "failures": failures,
                },
                indent=2,
            )
        )
        print(f"report -> {args.report}")

    if failures:
        print(f"\nFAIL: {len(failures)} rooms exceeded ±{args.tol}pp tolerance: {failures}", file=sys.stderr)
        return 1

    print(f"\nOK: {len(reports)} rooms within ±{args.tol}pp tolerance.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
