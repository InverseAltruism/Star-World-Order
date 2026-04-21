#!/usr/bin/env python3
"""
Skrumpey Asset Corpus Builder

Fetches all 3333 Skrumpey NFT metadata + images from IPFS and organizes
them into a normalized local corpus with full trait taxonomy and manifest.

Usage:
    python3 scripts/build_asset_corpus.py metadata   # Fetch all metadata JSONs
    python3 scripts/build_asset_corpus.py images      # Download all PNG images
    python3 scripts/build_asset_corpus.py manifest    # Generate manifest from local data
    python3 scripts/build_asset_corpus.py full        # All three steps
    python3 scripts/build_asset_corpus.py status      # Show current corpus status

Output structure:
    data/corpus/
    ├── metadata/          # 3333 JSON files (1.json .. 3333.json)
    ├── images/
    │   ├── png/           # 3333 PNG files (1.png .. 3333.png)
    │   └── gif/           # GIF variants where they exist
    ├── by_trait/          # Symlinks organized by trait_type/value/tokenId.png
    ├── star/              # Symlinks to the 333 Star Skrumpey images
    └── manifest.json      # Full corpus manifest with counts + integrity
"""

import json
import os
import sys
import time
import hashlib
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from collections import defaultdict

TOTAL_TOKENS = 3333
METADATA_GATEWAY = "https://bafybeibs4foulw6giemwwxwye2qtc3bd2lx34va6c3lpkjvsweevxudsjm.ipfs.dweb.link"
IMAGE_GATEWAY = "https://ipfs-proxy.magiceden.dev/ipfs/bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu"
METADATA_CID = "bafybeibs4foulw6giemwwxwye2qtc3bd2lx34va6c3lpkjvsweevxudsjm"
IMAGE_CID = "bafybeig6jmjboqpx6puv4joxgzrzraqy7jdh63kf4dx6mupxhsl6lhr3cu"

STAR_SKRUMPEY_IDS = [
    3, 17, 20, 23, 38, 40, 60, 84, 96, 106, 108, 118, 120, 141, 149, 164, 180, 191, 204, 206,
    211, 226, 258, 270, 271, 274, 294, 332, 338, 339, 341, 346, 357, 362, 368, 406, 421, 431,
    439, 442, 456, 461, 511, 533, 547, 558, 562, 563, 567, 588, 594, 596, 627, 629, 643, 650,
    652, 659, 672, 675, 680, 693, 701, 704, 705, 709, 710, 714, 717, 726, 753, 759, 760, 762,
    775, 794, 800, 803, 804, 806, 807, 829, 841, 845, 850, 854, 857, 870, 877, 880, 888, 890,
    893, 905, 909, 918, 933, 950, 951, 960, 962, 984, 988, 1003, 1015, 1022, 1043, 1048, 1049,
    1052, 1059, 1075, 1096, 1101, 1103, 1108, 1118, 1132, 1139, 1142, 1152, 1163, 1197, 1202,
    1210, 1222, 1228, 1235, 1250, 1284, 1287, 1310, 1342, 1358, 1362, 1369, 1370, 1374, 1377,
    1407, 1417, 1419, 1429, 1459, 1461, 1475, 1487, 1495, 1507, 1516, 1517, 1522, 1537, 1540,
    1547, 1548, 1557, 1564, 1578, 1594, 1601, 1603, 1604, 1612, 1617, 1634, 1636, 1651, 1655,
    1672, 1681, 1700, 1702, 1716, 1756, 1766, 1782, 1791, 1795, 1799, 1804, 1807, 1814, 1824,
    1830, 1841, 1864, 1868, 1874, 1917, 1931, 1942, 1947, 1968, 1978, 1987, 1988, 1993, 2010,
    2041, 2043, 2058, 2064, 2081, 2084, 2093, 2128, 2131, 2137, 2146, 2165, 2183, 2185, 2198,
    2201, 2207, 2210, 2239, 2240, 2242, 2258, 2260, 2276, 2278, 2281, 2289, 2294, 2295, 2317,
    2325, 2346, 2356, 2397, 2402, 2421, 2446, 2454, 2460, 2464, 2466, 2470, 2480, 2489, 2497,
    2526, 2528, 2536, 2537, 2548, 2558, 2563, 2574, 2585, 2596, 2597, 2599, 2610, 2614, 2620,
    2634, 2635, 2645, 2660, 2667, 2682, 2689, 2694, 2722, 2729, 2730, 2754, 2756, 2763, 2781,
    2785, 2789, 2825, 2835, 2842, 2844, 2858, 2862, 2867, 2876, 2891, 2901, 2935, 2958, 2970,
    2985, 2987, 2992, 2999, 3022, 3035, 3056, 3073, 3083, 3096, 3101, 3117, 3134, 3144, 3146,
    3159, 3166, 3169, 3176, 3189, 3199, 3205, 3206, 3211, 3219, 3221, 3222, 3227, 3258, 3263,
    3266, 3267, 3268, 3271, 3279, 3284, 3288, 3294, 3295, 3298, 3311, 3319, 3329, 3332,
]
STAR_SET = set(STAR_SKRUMPEY_IDS)

SCRIPT_DIR = Path(__file__).resolve().parent
WORKSPACE = SCRIPT_DIR.parent
CORPUS_DIR = WORKSPACE / "data" / "corpus"
METADATA_DIR = CORPUS_DIR / "metadata"
IMAGE_PNG_DIR = CORPUS_DIR / "images" / "png"
IMAGE_GIF_DIR = CORPUS_DIR / "images" / "gif"
BY_TRAIT_DIR = CORPUS_DIR / "by_trait"
STAR_DIR = CORPUS_DIR / "star"
MANIFEST_PATH = CORPUS_DIR / "manifest.json"


def ensure_dirs():
    for d in [METADATA_DIR, IMAGE_PNG_DIR, IMAGE_GIF_DIR, BY_TRAIT_DIR, STAR_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def fetch_url(url, timeout=20, retries=3):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "SkrumpeyCorpusBuilder/1.0",
                "Accept": "*/*",
            })
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.read()
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
            if attempt < retries - 1:
                time.sleep(1.5 * (attempt + 1))
            else:
                return None
    return None


def fetch_metadata_single(token_id):
    path = METADATA_DIR / f"{token_id}.json"
    if path.exists() and path.stat().st_size > 10:
        return token_id, True, "cached"

    url = f"{METADATA_GATEWAY}/{token_id}"
    data = fetch_url(url, timeout=20)
    if data:
        try:
            parsed = json.loads(data)
            path.write_bytes(data)
            return token_id, True, "fetched"
        except json.JSONDecodeError:
            return token_id, False, "invalid_json"
    return token_id, False, "fetch_failed"


def fetch_image_single(token_id, ext="png"):
    if ext == "png":
        out_dir = IMAGE_PNG_DIR
    else:
        out_dir = IMAGE_GIF_DIR

    path = out_dir / f"{token_id}.{ext}"
    if path.exists() and path.stat().st_size > 100:
        return token_id, True, "cached"

    url = f"{IMAGE_GATEWAY}/{token_id}.{ext}"
    data = fetch_url(url, timeout=30)
    if data and len(data) > 100:
        path.write_bytes(data)
        return token_id, True, "fetched"
    return token_id, False, "fetch_failed"


def fetch_all_metadata():
    ensure_dirs()
    print(f"Fetching metadata for {TOTAL_TOKENS} tokens...")
    print(f"Gateway: {METADATA_GATEWAY}")
    print(f"Output: {METADATA_DIR}")
    print()

    results = {"fetched": 0, "cached": 0, "failed": []}
    batch_size = 10
    token_ids = list(range(1, TOTAL_TOKENS + 1))

    for batch_start in range(0, len(token_ids), batch_size):
        batch = token_ids[batch_start:batch_start + batch_size]

        with ThreadPoolExecutor(max_workers=5) as pool:
            futures = {pool.submit(fetch_metadata_single, tid): tid for tid in batch}
            for future in as_completed(futures):
                tid, success, status = future.result()
                if success:
                    results[status] = results.get(status, 0) + 1
                else:
                    results["failed"].append((tid, status))

        done = min(batch_start + batch_size, TOTAL_TOKENS)
        if done % 100 == 0 or done == TOTAL_TOKENS:
            print(f"  Progress: {done}/{TOTAL_TOKENS} "
                  f"(fetched={results.get('fetched', 0)}, "
                  f"cached={results.get('cached', 0)}, "
                  f"failed={len(results['failed'])})")

        if batch_start + batch_size < len(token_ids):
            time.sleep(0.5)

    print(f"\nMetadata complete: {results.get('fetched', 0)} fetched, "
          f"{results.get('cached', 0)} cached, {len(results['failed'])} failed")
    if results["failed"]:
        print(f"Failed tokens: {[t[0] for t in results['failed'][:20]]}")
    return results


def fetch_all_images():
    ensure_dirs()
    print(f"Downloading PNG images for {TOTAL_TOKENS} tokens...")
    print(f"Gateway: {IMAGE_GATEWAY}")
    print(f"Output: {IMAGE_PNG_DIR}")
    print()

    results = {"fetched": 0, "cached": 0, "failed": []}
    batch_size = 20
    token_ids = list(range(1, TOTAL_TOKENS + 1))

    for batch_start in range(0, len(token_ids), batch_size):
        batch = token_ids[batch_start:batch_start + batch_size]

        with ThreadPoolExecutor(max_workers=10) as pool:
            futures = {pool.submit(fetch_image_single, tid, "png"): tid for tid in batch}
            for future in as_completed(futures):
                tid, success, status = future.result()
                if success:
                    results[status] = results.get(status, 0) + 1
                else:
                    results["failed"].append(tid)

        done = min(batch_start + batch_size, TOTAL_TOKENS)
        if done % 200 == 0 or done == TOTAL_TOKENS:
            print(f"  Progress: {done}/{TOTAL_TOKENS} "
                  f"(fetched={results.get('fetched', 0)}, "
                  f"cached={results.get('cached', 0)}, "
                  f"failed={len(results['failed'])})")

        if batch_start + batch_size < len(token_ids):
            time.sleep(0.3)

    print(f"\nImages complete: {results.get('fetched', 0)} fetched, "
          f"{results.get('cached', 0)} cached, {len(results['failed'])} failed")
    if results["failed"]:
        print(f"Failed tokens: {results['failed'][:20]}")
    return results


def build_manifest():
    ensure_dirs()
    print("Building manifest from local corpus...")

    trait_taxonomy = defaultdict(lambda: defaultdict(list))
    trait_counts_by_type = defaultdict(int)
    token_records = {}
    metadata_present = set()
    metadata_missing = []
    image_present = set()
    image_missing = []
    star_tokens = []

    for tid in range(1, TOTAL_TOKENS + 1):
        meta_path = METADATA_DIR / f"{tid}.json"
        img_path = IMAGE_PNG_DIR / f"{tid}.png"

        record = {"token_id": tid, "is_star": tid in STAR_SET}

        if meta_path.exists() and meta_path.stat().st_size > 10:
            metadata_present.add(tid)
            try:
                meta = json.loads(meta_path.read_text())
                record["name"] = meta.get("name", f"SKRUMP #{tid}")
                record["traits"] = {}
                for attr in meta.get("attributes", []):
                    tt = attr.get("trait_type", "").lower().strip()
                    tv = attr.get("value", "").lower().strip()
                    if tt and tv:
                        record["traits"][tt] = tv
                        trait_taxonomy[tt][tv].append(tid)
                        trait_counts_by_type[tt] += 1
            except (json.JSONDecodeError, KeyError):
                record["name"] = f"SKRUMP #{tid}"
                record["traits"] = {}
        else:
            metadata_missing.append(tid)

        if img_path.exists() and img_path.stat().st_size > 100:
            image_present.add(tid)
            record["image_size"] = img_path.stat().st_size
            record["image_sha256"] = hashlib.sha256(img_path.read_bytes()).hexdigest()
        else:
            image_missing.append(tid)

        if tid in STAR_SET:
            star_tokens.append(record)

        token_records[tid] = record

    # Build by_trait symlinks
    print("  Creating by_trait symlinks...")
    for tt, values in trait_taxonomy.items():
        for tv, tids in values.items():
            safe_tt = tt.replace("/", "_").replace(" ", "_")
            safe_tv = tv.replace("/", "_").replace(" ", "_")
            trait_dir = BY_TRAIT_DIR / safe_tt / safe_tv
            trait_dir.mkdir(parents=True, exist_ok=True)
            for tid in tids:
                link = trait_dir / f"{tid}.png"
                target = IMAGE_PNG_DIR / f"{tid}.png"
                if target.exists() and not link.exists():
                    try:
                        link.symlink_to(target)
                    except OSError:
                        pass

    # Build star directory symlinks
    print("  Creating star directory symlinks...")
    for tid in STAR_SKRUMPEY_IDS:
        link = STAR_DIR / f"{tid}.png"
        target = IMAGE_PNG_DIR / f"{tid}.png"
        if target.exists() and not link.exists():
            try:
                link.symlink_to(target)
            except OSError:
                pass

    # Compute trait summary
    trait_summary = {}
    for tt in sorted(trait_taxonomy.keys()):
        values = trait_taxonomy[tt]
        trait_summary[tt] = {
            "unique_values": len(values),
            "total_occurrences": sum(len(v) for v in values.values()),
            "values": {tv: len(tids) for tv, tids in sorted(values.items(), key=lambda x: -len(x[1]))},
        }

    # Duplicate image detection (by hash)
    print("  Checking for duplicate images...")
    hash_to_tokens = defaultdict(list)
    for tid, rec in token_records.items():
        h = rec.get("image_sha256")
        if h:
            hash_to_tokens[h].append(tid)
    duplicates = {h: tids for h, tids in hash_to_tokens.items() if len(tids) > 1}

    manifest = {
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "ipfs": {
            "metadata_cid": METADATA_CID,
            "image_cid": IMAGE_CID,
            "metadata_gateway": METADATA_GATEWAY,
            "image_gateway": IMAGE_GATEWAY,
        },
        "collection": {
            "total_tokens": TOTAL_TOKENS,
            "star_tokens": len(STAR_SKRUMPEY_IDS),
            "non_star_tokens": TOTAL_TOKENS - len(STAR_SKRUMPEY_IDS),
        },
        "corpus_status": {
            "metadata_present": len(metadata_present),
            "metadata_missing": len(metadata_missing),
            "metadata_missing_ids": metadata_missing[:50],
            "images_present": len(image_present),
            "images_missing": len(image_missing),
            "images_missing_ids": image_missing[:50],
            "completeness_pct": round(
                (len(metadata_present) + len(image_present)) / (TOTAL_TOKENS * 2) * 100, 1
            ),
        },
        "trait_taxonomy": trait_summary,
        "duplicate_images": {
            "count": len(duplicates),
            "groups": {h: tids for h, tids in list(duplicates.items())[:20]},
        },
        "star_constellation_distribution": {},
    }

    # Star constellation counts
    constellation_counts = defaultdict(int)
    for rec in star_tokens:
        c = rec.get("traits", {}).get("constellation", "unknown")
        constellation_counts[c] += 1
    manifest["star_constellation_distribution"] = dict(
        sorted(constellation_counts.items(), key=lambda x: -x[1])
    )

    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2, default=str))
    print(f"\nManifest written to {MANIFEST_PATH}")
    print(f"  Metadata: {len(metadata_present)}/{TOTAL_TOKENS} present")
    print(f"  Images:   {len(image_present)}/{TOTAL_TOKENS} present")
    print(f"  Traits:   {len(trait_taxonomy)} types, "
          f"{sum(len(v) for v in trait_taxonomy.values())} unique values")
    print(f"  Duplicates: {len(duplicates)} groups")
    print(f"  Completeness: {manifest['corpus_status']['completeness_pct']}%")

    return manifest


def show_status():
    meta_count = len(list(METADATA_DIR.glob("*.json"))) if METADATA_DIR.exists() else 0
    img_count = len(list(IMAGE_PNG_DIR.glob("*.png"))) if IMAGE_PNG_DIR.exists() else 0
    gif_count = len(list(IMAGE_GIF_DIR.glob("*.gif"))) if IMAGE_GIF_DIR.exists() else 0

    print(f"Corpus directory: {CORPUS_DIR}")
    print(f"  Metadata JSONs: {meta_count}/{TOTAL_TOKENS}")
    print(f"  PNG images:     {img_count}/{TOTAL_TOKENS}")
    print(f"  GIF variants:   {gif_count}")

    if MANIFEST_PATH.exists():
        m = json.loads(MANIFEST_PATH.read_text())
        print(f"  Manifest:       {m.get('generated_at', 'unknown')}")
        print(f"  Completeness:   {m.get('corpus_status', {}).get('completeness_pct', '?')}%")
        tt = m.get("trait_taxonomy", {})
        print(f"  Trait types:    {len(tt)}")
        for ttype, info in sorted(tt.items()):
            print(f"    {ttype}: {info['unique_values']} values, {info['total_occurrences']} occurrences")
    else:
        print("  Manifest:       not yet generated (run 'manifest' after fetching)")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"

    if cmd == "metadata":
        fetch_all_metadata()
    elif cmd == "images":
        fetch_all_images()
    elif cmd == "manifest":
        build_manifest()
    elif cmd == "full":
        fetch_all_metadata()
        print("\n" + "=" * 60 + "\n")
        fetch_all_images()
        print("\n" + "=" * 60 + "\n")
        build_manifest()
    elif cmd == "status":
        show_status()
    else:
        print(f"Unknown command: {cmd}")
        print("Usage: build_asset_corpus.py [metadata|images|manifest|full|status]")
        sys.exit(1)
