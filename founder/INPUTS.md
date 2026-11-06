# Founder panel inputs

These are **simulated-buyer** inputs for `/founder-consumer`. They are not
customers, conversion, or testimonials.

## What was attached (outdated)

Preserved verbatim in `founder/inputs-original/`:

- `customer.json` — “free self-filing, optional assisted filing for 15% of
  recovery”; segments Busy working adult / Money-optimizer / Data-breach
  victim; behaviours including deal hunters who file every no-proof claim.
- `pitch.md` — matching and self-filing always free; optional we-file-for-you
  at 15% if it pays.

That pitch is **not** what the live site says.

## What the live site actually offers (tested)

Grounded in current UI copy (`src/lib/copy.ts`, home, pricing, how-it-works),
with `FEE_DISCLOSURE_ENABLED` and `ASSISTED_FILING_ENABLED` off:

- ClaimMatch is **free during beta**.
- You file on the official administrator site yourself. Filing there is free.
- ClaimMatch does not file claims, does not handle settlement money, and is
  not a law firm.
- Listings are unverified until checked against the official notice.
- Copy-ready profile details exist; you still submit the official form.

## Planned paid model (not live — not shown to the panel)

Documented only in `founder/planned-model.md`. Owner intent: 15% of recovery
on claims, including self-filed, with assisted filing after legal clearance.
Those flags stay off. Counsel and legal entity are in progress, not cleared.
The 100-buyer panel tests the **current beta pitch only**.

## Persona hypothesis (do not treat as research)

The attached segments (US adults 25–55, busy workers, money optimizers,
breach searchers) are **hypotheses**. There is no interview file in this
repo that confirms them. The panel keeps the same shares so the old and new
pitches can be compared, and labels them as hypotheses in `customer.json`.

Deal-hunter “file every no-proof claim” is a hypothesized behaviour, not an
endorsement. The pitch tells people not to file unless the official notice
describes them and they have proof the notice requires.
