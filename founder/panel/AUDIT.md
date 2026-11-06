# Panel provenance audit (read-only)

Does **not** retally or edit authored answers. Does **not** run another 100.
Simulated mistaken beliefs are not website facts.

## Independently generated answers

- Answer files present: 100 / 100. Missing: none.
- Distinct SHA-256 prefixes: **100** / 100 files (identical files would collapse).
- Distinct `reason` strings: **100**.
- Distinct `objection` strings: **100**.
- Authored `buys=true` count in files (not a new tally job): 0.

## Distinct prompts

Each `briefs/P###.md` is filled from `panel.py` BRIEF with a unique persona card
(name, age, segment, income, behaviour, habit, objection). Pitch text is shared;
the WHO YOU ARE block is not. Sub-agents were instructed to write their own JSON
file; the moderator tool never answers.

## Do briefs force a rejection or inject false facts?

- Honesty rails present in template: True.
- Template contains a hardcoded `buys: false` or 'must say no': **False**.
- Pitch does **not** say browsing requires an account. It says:

```
ClaimMatch (lawsuitai.org) is a free-during-beta assistant for open US class-action settlements.
You browse listings, read who may qualify, and open the official notice and claim form. You file on the administrator’s site yourself. Filing there is free.
ClaimMatch does not file for you, does not handle settlement money, and is not a law firm. Listings are unverified until checked against the official site.
Only file if the official notice describes you. If it requires proof you do not have, do not file.
Creating an account is free. A paid model may come later; nothing paid is live today. We will tell you before any fee applies.
```

- 'Creating an account is free. A paid model may come later' is true of the
  current beta copy, but it is easy to read as an account wall. The live site
  primary CTA (flag off) is **See open settlements**; `/trust` says browsing
  needs no account. That gap is a simulated-belief issue, not a site fact.

- Answers that treat an account/PII wall as the blocker: 95 (e.g. P001, P002, P003, P004, P005, P006, P007, P008…).
- Answers that treat a future fee / bait-and-switch as the blocker: 21.
- Answers that ask to browse with no account (would-change-my-mind): 71.

## Price 'buy' on a free-beta product

Van Westendorp fields were collected because the panel schema asks for them.
The live product has **no price**. Using those numbers, or `buys`, as a
conversion metric for a free-during-beta assistant is unsuitable. 0/100 is
a simulated-objection cluster, not a conversion rate.

## Caveat

Simulated buyers answered from the brief, not from browsing lawsuitai.org.
Their mistaken beliefs (must make an account to look; will be charged later
without notice) are **not** website facts. Confirm objections with real
people on the public site before treating this as demand evidence.
