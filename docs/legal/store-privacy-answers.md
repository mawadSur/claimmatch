# DRAFT — for counsel review, not in effect

**App Store privacy answers and Play Data safety — one-click filing**

Status: engineering draft for counsel (GitHub issue #53, `docs/legal/signoff-checklist.md` row 15). Nothing here is pasted into App Store Connect or the Play Console until counsel signs off row 15. Do not treat this file as live policy.

Sources (verified read-only 2026-11-25): live [lawsuitai.org/privacy](https://lawsuitai.org/privacy) (last updated November 17, 2026), `docs/legal/one-click-privacy-additions.md`, and shipped mobile one-click screens. This document maps those facts onto store questionnaires. It does not invent new privacy wording.

---

## How to use this

1. Counsel reviews this map against live `/privacy` and the one-click additions draft.
2. Counsel signs `docs/legal/signoff-checklist.md` row 15.
3. Only then paste answers into App Store Connect (App Privacy) and Play Console (Data safety).
4. Keep `mobile/app.json` `ios.privacyManifests` in step with those answers. This PR adds Photos or Videos because a shipped one-click screen collects them; other possible types are listed as gaps below.

---

## Data the questionnaires ask about

Each row is collected for App Functionality (not tracking, not sold). Linked to the member account unless noted. Health answers are collected only after per-settlement consent.

| Store label (Apple / Play) | Collected? | Source of truth | Shipped mobile screen | Privacy manifest today |
|---|---|---|---|---|
| Name | Yes | `/privacy` §2 Account details; Settings; one-click packet | Onboarding, Settings, PrefillPacket, one-click form | `NSPrivacyCollectedDataTypeName` |
| Email address | Yes | `/privacy` §2 Account details | Sign-in, Settings, PrefillPacket | `NSPrivacyCollectedDataTypeEmailAddress` |
| Phone number | Yes, optional | `/privacy` §2 Details you add in Settings | Settings, PrefillPacket | `NSPrivacyCollectedDataTypePhoneNumber` |
| Physical address / Address | Yes, with consent | `/privacy` §2 Mailing address | PrefillPacket (consent stamp); one-click form | `NSPrivacyCollectedDataTypePhysicalAddress` |
| User ID | Yes | `/privacy` §2 Usage (account id); Auth | Sign-in | `NSPrivacyCollectedDataTypeUserID` |
| Photos or Videos / Photos | Yes, when the member adds proof | `/privacy` §2 One-click filing (“photos and documents you upload”); `one-click-privacy-additions.md` B | `mobile/src/features/filing/DocumentUploader.tsx` (camera and library via `expo-image-picker`) | **Added this PR:** `NSPrivacyCollectedDataTypePhotosorVideos` |
| Other User Content / Files and docs, form answers | Yes | `/privacy` §2 Answers, claims you track, one-click form answers and documents | Matching questions; claim tracking; PacketItemsStep; DocumentUploader (`expo-document-picker`) | `NSPrivacyCollectedDataTypeOtherUserContent` |
| Notice or claim IDs | Yes, only if typed for that claim; never PINs/passcodes | `/privacy` §2 One-click filing; additions B | One-click questions of type `notice_id` | Covered by Other User Content / Other Data Types; counsel to pick the Play category |
| E-signature records (typed name, exact text, time, how/when last signed in, session, IP, user agent) | Yes, only when the member signs one-click | `/privacy` §2 One-click filing (“e-signature record and e-signature consent”); additions B | One-click sign flow (`src/lib/filing/v2/sign.ts`; IP/UA captured on the API, not as a standalone mobile field) | Not a dedicated Apple type. Closest: Other Data Types (already declared). **Gap:** whether IP also needs Diagnostics or Coarse Location |
| Health answers | Yes, only for settlements with law-firm consent text, and only after the member ticks that consent | `/privacy` §3; additions B | `mobile/src/features/filing/PacketItemsStep.tsx` (`health_consent_text` + checkbox) | **Not declared.** Counsel to choose Health & Fitness vs Sensitive Info before adding |
| Mailing address (saved to profile) | Yes, when the member saves it | `/privacy` §2 Mailing address; additions B counsel note | PrefillPacket address + consent | Same as Physical Address |
| Payout method name (never account numbers) | Yes, when the form asks | `/privacy` §2 One-click filing; additions B | One-click form | `NSPrivacyCollectedDataTypeOtherFinancialInfo` already declared; counsel to confirm that mapping |
| Purchase History | Declared in the current manifest | Existing `mobile/app.json` | Not a one-click screen. Likely catalog payout ranges / tracked claims | `NSPrivacyCollectedDataTypePurchaseHistory` — **Gap:** confirm this still belongs |
| Other Data Types | Yes | Match results, claim status, confirmation numbers, Jev check results, filing records | Dashboard, claims, one-click | `NSPrivacyCollectedDataTypeOtherDataTypes` |

Tracking: `NSPrivacyTracking` is false. Do not mark any of the above as used for tracking.

---

## What `mobile/app.json` `ios.privacyManifests` already declares

Copied from the file (do not paste a stale list if the file has moved on):

- Tracking: false; no tracking domains.
- Collected data types (all linked, not tracking, App Functionality; Physical Address / Purchase History / Other Financial Info / Other Data Types also list Product Personalization):
  - Name
  - Email Address
  - Phone Number
  - Physical Address
  - User ID
  - Other User Content
  - Photos or Videos *(added because DocumentUploader is a shipped one-click proof screen)*
  - Purchase History
  - Other Financial Info
  - Other Data Types
- Accessed APIs: UserDefaults (`CA92.1`), File Timestamp (`C617.1`), System Boot Time (`35F9.1`).

Camera and photos permission strings already exist on the `expo-image-picker` plugin. Those are not privacy-nutrition answers; they must stay consistent with Photos or Videos = App Functionality.

---

## Gaps for counsel (do not guess in the consoles)

1. **Health.** Shipped one-click screens can collect health answers after per-settlement consent. The privacy manifest does **not** declare Health. Decide Apple “Health & Fitness” vs “Sensitive Info” and the Play “Health info” box, then add a manifest type only after that decision.
2. **E-signature IP / user agent / sign-in time.** Live `/privacy` names the e-signature record; the additions draft lists IP, browser, and last sign-in. Decide whether Other Data Types is enough, or whether Apple Diagnostics / Coarse Location and Play “Device or other IDs” / “Diagnostics” also apply. Do not add those types in this PR.
3. **Notice / claim IDs.** Other User Content vs Other Data Types vs a Play “Other” box.
4. **Purchase History and Other Financial Info.** Already in the manifest from the pre-one-click app. Confirm they still match what the app collects (payout method *names* only; no account numbers).
5. **Product Personalization purposes** on address, financial, and other types. Confirm or drop.
6. **Account export.** `one-click-privacy-additions.md` G: one-click packets, documents, signatures and consents may be missing from `/api/account/export`. Store answers that promise a full download need this resolved first.
7. **Deletion vs legal-record retain.** Checklist row 8 (`LEGAL_RECORDS_ON_ACCOUNT_DELETION`) is still a founder/counsel setting. Play/Apple “can users request deletion” must match the live mode.
8. **This file, `mobile/store.config.json`, and `mobile/src/copy/store.ts` are drafts.** Row 15 sign-off is required before anyone pastes them.

---

## What this PR does not do

- Does not paste answers into Apple or Google consoles.
- Does not flip flags, run SQL, or change live `/privacy`.
- Does not add a Health (or Diagnostics / Location) manifest type.
- Does not fill `ascAppId`, `appleTeamId`, or secrets in `mobile/eas.json`.
