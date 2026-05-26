#!/usr/bin/env python3
"""Reverse false queue closures whose post-flight artifact never landed.

The spawn post-flight hook *detects* when a task is marked done in ``QUEUE.md``
but its promised artifact is missing, emitting a
``SPAWN_POSTFLIGHT_HELD: ARTIFACT_MISSING`` (or ``NO_CONCRETE_ARTIFACT_PATH``)
row to ``monitoring/spawn_artifact_holds.log``. Detection alone does not undo
the closure: the row stays ``[x]`` in ``QUEUE.md``, so it is counted as done
while being silently incomplete — invisible to the scheduler yet unfinished.
That silent-incomplete state is the dominant queue failure mode this month.

This script closes the loop. It parses the hold log, dedupes by ``tag``, and
for every held tag still marked ``[x]`` in ``QUEUE.md`` whose ``missing_path``
is *still absent on disk* it reopens the row:

* flips ``[x]`` -> ``[ ]``
* strips the leading ``[UNVERIFIED]`` closure marker
* appends ``_(reopened <date>: held artifact never landed — <missing_path>)_``

Tags whose ``missing_path`` now EXISTS on disk are treated as
``FALSE_HOLD_RESOLVED`` (a stale hold from the verifier/workspace mismatch,
see MEMORY.md) and are *skipped*, never reopened.

Default mode is ``--dry-run`` (prints the unified intent, mutates nothing).
``--apply`` rewrites ``QUEUE.md`` and appends one audit row per reopen to
``monitoring/held_closure_reopens.log``.

Hold-log format (JSON lines, one event per line)::

    {"ts": "2026-05-23T11:08:00Z", "event": "SPAWN_POSTFLIGHT_HELD",
     "tag": "BRAIN_AVG_ONNX_WARMUP_2026-05-23", "reason": "ARTIFACT_MISSING",
     "missing_path": "docs/brain/avg_onnx_warmup.md"}

Lines that are not JSON, lack a ``tag``, or carry a non-held reason are
ignored, so the parser tolerates interleaved free-form log noise.
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import re
import sys
from dataclasses import dataclass

# Reasons that mean "the closure was held because the artifact never landed".
HELD_REASONS = frozenset({"ARTIFACT_MISSING", "NO_CONCRETE_ARTIFACT_PATH"})

DEFAULT_HOLD_LOG = "monitoring/spawn_artifact_holds.log"
DEFAULT_QUEUE = "memory/evolution/QUEUE.md"
DEFAULT_REOPEN_LOG = "monitoring/held_closure_reopens.log"

# A markdown checklist row that is currently CLOSED: ``- [x] ...`` / ``* [x] ...``.
# Group 1 = list prefix incl. the bracket, group 2 = the trailing content.
_CHECKED_ROW = re.compile(r"^(\s*[-*]\s*)\[[xX]\](\s+)(.*)$")
# A leading ``[UNVERIFIED]`` closure marker (optionally followed by whitespace).
_UNVERIFIED = re.compile(r"^\[UNVERIFIED\]\s*")


@dataclass(frozen=True)
class HoldEntry:
    """A single deduped post-flight hold for one tag."""

    tag: str
    reason: str
    missing_path: str
    ts: str = ""


@dataclass(frozen=True)
class Action:
    """The decision taken for one held tag."""

    tag: str
    kind: str  # REOPENED | FALSE_HOLD_RESOLVED | NO_OPEN_ROW
    missing_path: str
    old_line: str = ""
    new_line: str = ""


def parse_hold_log(text: str) -> "dict[str, HoldEntry]":
    """Parse hold-log text into ``{tag: HoldEntry}``, deduped by tag.

    Dedupe keeps the *last* held event for a tag (most recent state wins).
    Only events whose ``reason`` is in :data:`HELD_REASONS` are retained.
    Malformed / unrelated lines are silently skipped.
    """
    holds: dict[str, HoldEntry] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            rec = json.loads(line)
        except (ValueError, TypeError):
            continue
        if not isinstance(rec, dict):
            continue
        reason = rec.get("reason")
        tag = rec.get("tag")
        if reason not in HELD_REASONS or not tag:
            continue
        holds[tag] = HoldEntry(
            tag=tag,
            reason=reason,
            missing_path=rec.get("missing_path", "") or "",
            ts=rec.get("ts", "") or "",
        )
    return holds


def artifact_exists(missing_path: str, repo_root: str) -> bool:
    """True if ``missing_path`` resolves to something on disk under ``repo_root``."""
    if not missing_path:
        return False
    path = missing_path
    if not os.path.isabs(path):
        path = os.path.join(repo_root, missing_path)
    return os.path.exists(path)


def _row_matches_tag(content: str, tag: str) -> bool:
    """True if a checklist row's content references ``[<tag>]`` as a token."""
    return f"[{tag}]" in content


def reconcile(
    queue_text: str,
    holds: "dict[str, HoldEntry]",
    repo_root: str,
    date: str,
) -> "tuple[str, list[Action]]":
    """Compute reopened ``QUEUE.md`` text and the list of actions taken.

    For each held tag (deduped) we locate the *checked* row that references it:

    * artifact still absent -> reopen the row (``[x]`` -> ``[ ]``, strip
      ``[UNVERIFIED]``, append the reopened annotation) and record ``REOPENED``.
    * artifact now present -> record ``FALSE_HOLD_RESOLVED`` and leave it closed.
    * no open ``[x]`` row found -> record ``NO_OPEN_ROW`` (nothing to reverse).
    """
    lines = queue_text.split("\n")
    actions: list[Action] = []

    for tag in sorted(holds):
        entry = holds[tag]
        if artifact_exists(entry.missing_path, repo_root):
            actions.append(
                Action(tag, "FALSE_HOLD_RESOLVED", entry.missing_path)
            )
            continue

        idx = _find_checked_row(lines, tag)
        if idx is None:
            actions.append(Action(tag, "NO_OPEN_ROW", entry.missing_path))
            continue

        old_line = lines[idx]
        new_line = _reopen_line(old_line, entry.missing_path, date)
        lines[idx] = new_line
        actions.append(
            Action(tag, "REOPENED", entry.missing_path, old_line, new_line)
        )

    return "\n".join(lines), actions


def _find_checked_row(lines: "list[str]", tag: str) -> "int | None":
    """Index of the first ``[x]`` checklist row referencing ``tag``, or None."""
    for i, line in enumerate(lines):
        m = _CHECKED_ROW.match(line)
        if m and _row_matches_tag(m.group(3), tag):
            return i
    return None


def _reopen_line(line: str, missing_path: str, date: str) -> str:
    """Flip a checked row to open, drop ``[UNVERIFIED]``, append the note."""
    m = _CHECKED_ROW.match(line)
    assert m is not None, "caller must pass a checked row"
    prefix, _gap, content = m.group(1), m.group(2), m.group(3)
    content = _UNVERIFIED.sub("", content, count=1)
    note = f" _(reopened {date}: held artifact never landed — {missing_path})_"
    return f"{prefix}[ ] {content}{note}"


def render_report(actions: "list[Action]", apply: bool) -> str:
    """Human-readable closure report: reopened vs false-hold-skipped counts."""
    reopened = [a for a in actions if a.kind == "REOPENED"]
    false_holds = [a for a in actions if a.kind == "FALSE_HOLD_RESOLVED"]
    no_row = [a for a in actions if a.kind == "NO_OPEN_ROW"]

    mode = "APPLY" if apply else "DRY-RUN"
    out = [f"=== held-closure reconcile ({mode}) ==="]

    if reopened:
        out.append(f"\nReopened ({len(reopened)}):")
        for a in reopened:
            out.append(f"  [x] -> [ ]  {a.tag}")
            out.append(f"      missing: {a.missing_path}")
    if false_holds:
        out.append(f"\nFalse holds resolved — skipped ({len(false_holds)}):")
        for a in false_holds:
            out.append(f"  KEEP [x]  {a.tag}  (artifact now present: {a.missing_path})")
    if no_row:
        out.append(f"\nHeld tags with no open [x] row — nothing to reverse ({len(no_row)}):")
        for a in no_row:
            out.append(f"  --  {a.tag}")

    out.append(
        f"\nSummary: reopened={len(reopened)} "
        f"false_hold_skipped={len(false_holds)} no_open_row={len(no_row)}"
    )
    if not apply and reopened:
        out.append("(dry-run: no files modified — re-run with --apply to reopen)")
    return "\n".join(out)


def _audit_rows(actions: "list[Action]", now_iso: str) -> "list[str]":
    """One audit line per reopen for ``held_closure_reopens.log``."""
    return [
        f"{now_iso} | REOPENED | {a.tag} | {a.missing_path}"
        for a in actions
        if a.kind == "REOPENED"
    ]


def main(argv: "list[str] | None" = None) -> int:
    parser = argparse.ArgumentParser(
        description="Reopen falsely-closed QUEUE.md rows whose held artifact never landed.",
    )
    parser.add_argument("--repo-root", default=".", help="repo root for path resolution (default: .)")
    parser.add_argument("--hold-log", default=None, help=f"hold log path (default: <repo>/{DEFAULT_HOLD_LOG})")
    parser.add_argument("--queue", default=None, help=f"QUEUE.md path (default: <repo>/{DEFAULT_QUEUE})")
    parser.add_argument("--reopen-log", default=None, help=f"audit log path (default: <repo>/{DEFAULT_REOPEN_LOG})")
    parser.add_argument("--date", default=_dt.date.today().isoformat(), help="reopened-on date (default: today)")
    parser.add_argument("--apply", action="store_true", help="mutate QUEUE.md (default: dry-run)")
    args = parser.parse_args(argv)

    repo_root = os.path.abspath(args.repo_root)
    hold_log = args.hold_log or os.path.join(repo_root, DEFAULT_HOLD_LOG)
    queue = args.queue or os.path.join(repo_root, DEFAULT_QUEUE)
    reopen_log = args.reopen_log or os.path.join(repo_root, DEFAULT_REOPEN_LOG)

    if not os.path.exists(hold_log):
        print(f"hold log not found: {hold_log}", file=sys.stderr)
        return 2
    if not os.path.exists(queue):
        print(f"QUEUE.md not found: {queue}", file=sys.stderr)
        return 2

    with open(hold_log, encoding="utf-8") as fh:
        holds = parse_hold_log(fh.read())
    with open(queue, encoding="utf-8") as fh:
        queue_text = fh.read()

    new_text, actions = reconcile(queue_text, holds, repo_root, args.date)
    print(render_report(actions, args.apply))

    if args.apply:
        reopened = [a for a in actions if a.kind == "REOPENED"]
        if reopened:
            with open(queue, "w", encoding="utf-8") as fh:
                fh.write(new_text)
            now_iso = _dt.datetime.now(_dt.timezone.utc).isoformat()
            os.makedirs(os.path.dirname(reopen_log) or ".", exist_ok=True)
            with open(reopen_log, "a", encoding="utf-8") as fh:
                fh.write("\n".join(_audit_rows(actions, now_iso)) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
