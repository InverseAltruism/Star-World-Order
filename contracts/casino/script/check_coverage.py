#!/usr/bin/env python3
"""Enforce per-contract LCOV coverage thresholds for the Cosmic Casino suite.

Parses an LCOV tracefile and verifies that every Solidity source file matching
``--include`` (default: ``src/``) meets the line and branch coverage minimums.

Usage:
    python3 check_coverage.py <lcov.info> [--line N] [--branch N] [--include PREFIX]

Exit codes:
    0 — every gated contract meets both thresholds.
    1 — at least one contract is below threshold (CI gate failure).
    2 — usage / parse error.
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Record:
    source: str
    lines_found: int = 0
    lines_hit: int = 0
    branches_found: int = 0
    branches_hit: int = 0

    @property
    def line_pct(self) -> float:
        return 100.0 if self.lines_found == 0 else 100.0 * self.lines_hit / self.lines_found

    @property
    def branch_pct(self) -> float:
        return 100.0 if self.branches_found == 0 else 100.0 * self.branches_hit / self.branches_found


def parse_lcov(path: Path) -> list[Record]:
    records: list[Record] = []
    current: Record | None = None
    with path.open("r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.strip()
            if line.startswith("SF:"):
                current = Record(source=line[3:])
            elif current is None:
                continue
            elif line.startswith("LF:"):
                current.lines_found = int(line[3:])
            elif line.startswith("LH:"):
                current.lines_hit = int(line[3:])
            elif line.startswith("BRF:"):
                current.branches_found = int(line[4:])
            elif line.startswith("BRH:"):
                current.branches_hit = int(line[4:])
            elif line == "end_of_record":
                records.append(current)
                current = None
    return records


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lcov", type=Path, help="Path to lcov.info tracefile.")
    parser.add_argument("--line", type=float, default=90.0, help="Min line coverage %% (default: 90).")
    parser.add_argument("--branch", type=float, default=80.0, help="Min branch coverage %% (default: 80).")
    parser.add_argument(
        "--include",
        action="append",
        default=None,
        help="Source-path prefix to gate (repeatable). Default: src/",
    )
    args = parser.parse_args()

    if not args.lcov.is_file():
        print(f"check_coverage: lcov file not found: {args.lcov}", file=sys.stderr)
        return 2

    includes = args.include if args.include else ["src/"]
    records = [r for r in parse_lcov(args.lcov) if any(r.source.startswith(p) for p in includes)]

    if not records:
        print(
            f"check_coverage: no source files in lcov match prefixes {includes}",
            file=sys.stderr,
        )
        return 2

    failures: list[str] = []
    header = f"{'Contract':<40} {'Lines':>14} {'Line %':>8} {'Branches':>14} {'Branch %':>9}  Gate"
    print(header)
    print("-" * len(header))
    for r in sorted(records, key=lambda r: r.source):
        line_ok = r.line_pct + 1e-9 >= args.line
        # Treat contracts with zero recorded branches as branch-passing — there
        # is nothing to gate. This avoids false negatives on simple libraries.
        branch_ok = r.branches_found == 0 or r.branch_pct + 1e-9 >= args.branch
        status = "PASS" if (line_ok and branch_ok) else "FAIL"
        print(
            f"{r.source:<40} "
            f"{r.lines_hit:>6}/{r.lines_found:<7} {r.line_pct:>7.2f}% "
            f"{r.branches_hit:>6}/{r.branches_found:<7} {r.branch_pct:>8.2f}%  {status}"
        )
        if not line_ok:
            failures.append(f"{r.source}: line {r.line_pct:.2f}% < {args.line:.2f}%")
        if not branch_ok:
            failures.append(f"{r.source}: branch {r.branch_pct:.2f}% < {args.branch:.2f}%")

    print()
    print(f"Thresholds: line >= {args.line:.2f}%, branch >= {args.branch:.2f}% (per contract)")
    if failures:
        print(f"FAIL — {len(failures)} threshold violation(s):", file=sys.stderr)
        for f in failures:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print(f"PASS — all {len(records)} contract(s) meet thresholds")
    return 0


if __name__ == "__main__":
    sys.exit(main())
