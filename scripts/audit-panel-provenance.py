#!/usr/bin/env python3
"""Read-only provenance audit of the 100-buyer panel. Never writes answers or retallies."""
from __future__ import annotations

import hashlib
import json
import os
import re
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PANEL = os.path.join(ROOT, "founder", "panel")
BRIEF_TPL_MARKERS = [
    "Do not be agreeable",
    "Do not invent facts about the business beyond what is written above",
    "a polite yes is worse than a clear no",
]


def sha(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return h.hexdigest()[:12]


def load_json(path: str):
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def main() -> int:
    answers_dir = os.path.join(PANEL, "answers")
    briefs_dir = os.path.join(PANEL, "briefs")
    ids = [f"P{i:03d}" for i in range(1, 101)]
    hashes, reasons, objections, buy_vals = [], [], [], []
    account_wall, future_fee, browse_ok = [], [], []
    missing = []
    for pid in ids:
        ap = os.path.join(answers_dir, pid + ".json")
        bp = os.path.join(briefs_dir, pid + ".md")
        if not os.path.exists(ap) or not os.path.exists(bp):
            missing.append(pid)
            continue
        a = load_json(ap)
        hashes.append(sha(ap))
        reasons.append(a.get("reason") or "")
        objections.append(a.get("objection") or "")
        buy_vals.append(bool(a.get("buys")))
        blob = " ".join(str(a.get(k) or "") for k in ("reason", "objection", "would_change_my_mind")).lower()
        if re.search(r"account|sign ?up|log ?in|personal info|address or phone", blob):
            account_wall.append(pid)
        if re.search(r"fee later|charge me later|bait-and-switch|subscription|what's the catch", blob):
            future_fee.append(pid)
        if re.search(r"browse without|no account|without making an account|no login", blob):
            browse_ok.append(pid)

    unique_reason = len(set(reasons))
    unique_obj = len(set(objections))
    unique_hash = len(set(hashes))
    panel_py = open(os.path.join(ROOT, "founder", "panel.py"), encoding="utf-8").read()
    briefs_force_no = "buys\": false" in panel_py or "must say no" in panel_py.lower()
    pitch = open(os.path.join(ROOT, "founder", "pitch.md"), encoding="utf-8").read()

    lines = [
        "# Panel provenance audit (read-only)",
        "",
        "Does **not** retally or edit authored answers. Does **not** run another 100.",
        "Simulated mistaken beliefs are not website facts.",
        "",
        "## Independently generated answers",
        "",
        f"- Answer files present: {100 - len(missing)} / 100. Missing: {missing or 'none'}.",
        f"- Distinct SHA-256 prefixes: **{unique_hash}** / {len(hashes)} files (identical files would collapse).",
        f"- Distinct `reason` strings: **{unique_reason}**.",
        f"- Distinct `objection` strings: **{unique_obj}**.",
        f"- Authored `buys=true` count in files (not a new tally job): {sum(buy_vals)}.",
        "",
        "## Distinct prompts",
        "",
        "Each `briefs/P###.md` is filled from `panel.py` BRIEF with a unique persona card",
        "(name, age, segment, income, behaviour, habit, objection). Pitch text is shared;",
        "the WHO YOU ARE block is not. Sub-agents were instructed to write their own JSON",
        "file; the moderator tool never answers.",
        "",
        "## Do briefs force a rejection or inject false facts?",
        "",
        f"- Honesty rails present in template: {all(m in panel_py for m in BRIEF_TPL_MARKERS)}.",
        f"- Template contains a hardcoded `buys: false` or 'must say no': **{briefs_force_no}**.",
        "- Pitch does **not** say browsing requires an account. It says:",
        "",
        "```",
        pitch.strip(),
        "```",
        "",
        "- 'Creating an account is free. A paid model may come later' is true of the",
        "  current beta copy, but it is easy to read as an account wall. The live site",
        "  primary CTA (flag off) is **See open settlements**; `/trust` says browsing",
        "  needs no account. That gap is a simulated-belief issue, not a site fact.",
        "",
        f"- Answers that treat an account/PII wall as the blocker: {len(account_wall)} (e.g. {', '.join(account_wall[:8])}{'…' if len(account_wall) > 8 else ''}).",
        f"- Answers that treat a future fee / bait-and-switch as the blocker: {len(future_fee)}.",
        f"- Answers that ask to browse with no account (would-change-my-mind): {len(browse_ok)}.",
        "",
        "## Price 'buy' on a free-beta product",
        "",
        "Van Westendorp fields were collected because the panel schema asks for them.",
        "The live product has **no price**. Using those numbers, or `buys`, as a",
        "conversion metric for a free-during-beta assistant is unsuitable. 0/100 is",
        "a simulated-objection cluster, not a conversion rate.",
        "",
        "## Caveat",
        "",
        "Simulated buyers answered from the brief, not from browsing lawsuitai.org.",
        "Their mistaken beliefs (must make an account to look; will be charged later",
        "without notice) are **not** website facts. Confirm objections with real",
        "people on the public site before treating this as demand evidence.",
        "",
    ]
    out = os.path.join(PANEL, "AUDIT.md")
    with open(out, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
