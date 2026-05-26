"""Tests for scripts/queue/reconcile_held_closures.py.

Covers the acceptance cases:
* a held tag whose missing_path is absent is reopened ([x] -> [ ], note appended)
* a held tag whose missing_path EXISTS is skipped as a false hold (stays [x])
* repeated log lines for the same tag dedupe to a single action
* --dry-run mutates nothing on disk
* --apply flips rows and writes the audit log
"""
import importlib.util
import json
import os
import sys

import pytest

_HERE = os.path.dirname(__file__)
_SCRIPT = os.path.normpath(
    os.path.join(_HERE, "..", "scripts", "queue", "reconcile_held_closures.py")
)
_spec = importlib.util.spec_from_file_location("reconcile_held_closures", _SCRIPT)
rhc = importlib.util.module_from_spec(_spec)
sys.modules["reconcile_held_closures"] = rhc  # needed for dataclass annotation resolution
_spec.loader.exec_module(rhc)

DATE = "2026-05-26"


def _hold(tag, missing_path, reason="ARTIFACT_MISSING", ts="2026-05-26T11:08:00Z"):
    return json.dumps(
        {"ts": ts, "event": "SPAWN_POSTFLIGHT_HELD", "tag": tag,
         "reason": reason, "missing_path": missing_path}
    )


# --------------------------------------------------------------------------- #
# parse_hold_log
# --------------------------------------------------------------------------- #
def test_parse_only_held_reasons():
    log = "\n".join([
        _hold("TAG_A", "docs/a.md", reason="ARTIFACT_MISSING"),
        _hold("TAG_B", "docs/b.md", reason="NO_CONCRETE_ARTIFACT_PATH"),
        _hold("TAG_C", "docs/c.md", reason="SOME_OTHER_REASON"),
        "not json at all",
        json.dumps({"reason": "ARTIFACT_MISSING"}),  # no tag -> skipped
    ])
    holds = rhc.parse_hold_log(log)
    assert set(holds) == {"TAG_A", "TAG_B"}
    assert holds["TAG_B"].reason == "NO_CONCRETE_ARTIFACT_PATH"


def test_dedupe_repeated_lines_last_wins():
    log = "\n".join([
        _hold("TAG_A", "docs/old.md", ts="2026-05-20T00:00:00Z"),
        _hold("TAG_A", "docs/new.md", ts="2026-05-26T00:00:00Z"),
        _hold("TAG_A", "docs/new.md", ts="2026-05-26T00:00:00Z"),
    ])
    holds = rhc.parse_hold_log(log)
    assert list(holds) == ["TAG_A"]  # single deduped entry
    assert holds["TAG_A"].missing_path == "docs/new.md"


# --------------------------------------------------------------------------- #
# reconcile (in-memory)
# --------------------------------------------------------------------------- #
def test_missing_path_tag_is_reopened(tmp_path):
    queue = (
        "# Queue\n"
        "- [x] [UNVERIFIED] [TAG_MISSING] ship the thing\n"
        "- [ ] [TAG_PENDING] not yet\n"
    )
    holds = {"TAG_MISSING": rhc.HoldEntry("TAG_MISSING", "ARTIFACT_MISSING", "docs/missing.md")}
    new_text, actions = rhc.reconcile(queue, holds, str(tmp_path), DATE)

    assert [a.kind for a in actions] == ["REOPENED"]
    assert "- [ ] [TAG_MISSING] ship the thing" in new_text
    assert "[UNVERIFIED]" not in new_text  # marker stripped
    assert "_(reopened 2026-05-26: held artifact never landed — docs/missing.md)_" in new_text
    assert "[x]" not in new_text.split("\n")[1]  # the row is no longer checked


def test_present_path_tag_skipped_as_false_hold(tmp_path):
    # Create the artifact so it "exists" on disk.
    (tmp_path / "docs").mkdir()
    (tmp_path / "docs" / "present.md").write_text("landed")
    queue = "- [x] [UNVERIFIED] [TAG_PRESENT] done for real\n"
    holds = {"TAG_PRESENT": rhc.HoldEntry("TAG_PRESENT", "ARTIFACT_MISSING", "docs/present.md")}

    new_text, actions = rhc.reconcile(queue, holds, str(tmp_path), DATE)
    assert [a.kind for a in actions] == ["FALSE_HOLD_RESOLVED"]
    assert new_text == queue  # untouched, stays [x]


def test_no_open_row_for_tag(tmp_path):
    queue = "- [ ] [TAG_X] already open\n"
    holds = {"TAG_X": rhc.HoldEntry("TAG_X", "ARTIFACT_MISSING", "docs/x.md")}
    new_text, actions = rhc.reconcile(queue, holds, str(tmp_path), DATE)
    assert [a.kind for a in actions] == ["NO_OPEN_ROW"]
    assert new_text == queue


def test_reopen_without_unverified_marker(tmp_path):
    queue = "- [x] [TAG_PLAIN] no unverified marker here\n"
    holds = {"TAG_PLAIN": rhc.HoldEntry("TAG_PLAIN", "ARTIFACT_MISSING", "docs/p.md")}
    new_text, actions = rhc.reconcile(queue, holds, str(tmp_path), DATE)
    assert actions[0].kind == "REOPENED"
    assert "- [ ] [TAG_PLAIN] no unverified marker here _(reopened" in new_text


# --------------------------------------------------------------------------- #
# CLI: dry-run vs apply
# --------------------------------------------------------------------------- #
def _write_case(tmp_path):
    (tmp_path / "monitoring").mkdir()
    (tmp_path / "memory" / "evolution").mkdir(parents=True)
    hold_log = tmp_path / "monitoring" / "spawn_artifact_holds.log"
    hold_log.write_text("\n".join([
        _hold("TAG_MISSING", "docs/missing.md"),
        _hold("TAG_MISSING", "docs/missing.md"),  # dup
    ]) + "\n")
    queue = tmp_path / "memory" / "evolution" / "QUEUE.md"
    queue.write_text("- [x] [UNVERIFIED] [TAG_MISSING] ship it\n")
    return hold_log, queue


def test_dry_run_mutates_nothing(tmp_path, capsys):
    hold_log, queue = _write_case(tmp_path)
    before = queue.read_text()
    rc = rhc.main(["--repo-root", str(tmp_path), "--date", DATE])
    out = capsys.readouterr().out

    assert rc == 0
    assert queue.read_text() == before  # unchanged
    assert "reopened=1" in out
    assert "TAG_MISSING" in out
    assert "docs/missing.md" in out
    assert not (tmp_path / "monitoring" / "held_closure_reopens.log").exists()


def test_apply_flips_row_and_writes_audit(tmp_path):
    hold_log, queue = _write_case(tmp_path)
    rc = rhc.main(["--repo-root", str(tmp_path), "--date", DATE, "--apply"])
    assert rc == 0

    text = queue.read_text()
    assert "- [ ] [TAG_MISSING] ship it" in text
    assert "[UNVERIFIED]" not in text
    assert "_(reopened 2026-05-26:" in text

    audit = (tmp_path / "monitoring" / "held_closure_reopens.log").read_text()
    assert audit.count("REOPENED | TAG_MISSING") == 1  # deduped -> one row


def test_missing_inputs_return_error(tmp_path, capsys):
    rc = rhc.main(["--repo-root", str(tmp_path), "--date", DATE])
    assert rc == 2
    assert "not found" in capsys.readouterr().err


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
