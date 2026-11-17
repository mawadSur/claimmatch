# Maestro (iOS simulator)

Issue **#51** acceptance: one flow covers **packet start → filing steps** on the TEST settlement.

## Prerequisites

1. Dev client on the simulator (`npm run ios` from `mobile/`).
2. API env where `lawsuit-ai-one-click-test-settlement` exists (`scripts/one-click-test-settlement.ts`).
3. `ONE_CLICK_FILING_ENABLED` on the API the app calls.

## Run

```bash
cd mobile
export MAESTRO_TEST_EMAIL='…'
export MAESTRO_TEST_PASSWORD='…'
maestro test .maestro/one-click-filing-smoke.yaml
```

Jest covers full packet → sign → status (`tests/filing-*.test.tsx`). Extend this flow when status testIDs are stable after sign.
