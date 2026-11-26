# Owner-apply SQL → catalog revalidate

Claim-action and status edits should show on the next request, not after the
settlement page’s 5-minute ISR window (`export const revalidate = 300` on
`src/app/lawsuits/[slug]/page.tsx`). Home and `/lawsuits` use 15 minutes.

## After admin edits in the product

`PATCH /api/admin/lawsuits` already calls `revalidateCatalog(slug)` when an
admin updates `claim_action_type`, `claim_action`, or `status` (and on
publish / reject / close_missing / keep_missing). Bulk publish/reject busts
the catalog lists.

## After owner-apply SQL

SQL applied in the Supabase dashboard does **not** notify Next.js. After the
owner-apply script (`pnpm claim-action:sql` / `scripts/claim-action-types.ts`)
or any manual `update public.lawsuits set claim_action_type = …`, bust the
cache:

```bash
# One settlement
curl -X POST "$ORIGIN/api/admin/revalidate-catalog" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"slug":"bank-of-america-unused-vacation-class-action-settlement"}'

# Home, /lawsuits, and hub pages
curl -X POST "$ORIGIN/api/admin/revalidate-catalog" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json" \
  -d '{}'
```

Auth is the same pattern as Vercel Cron: `Authorization: Bearer ${CRON_SECRET}`,
or a signed-in admin session (`getAdminUser()`).

Do **not** apply SQL to production from this PR. Run the owner-apply script
and the revalidate POST in a later ops step.

## Paths busted

`src/lib/catalog-cache.ts` → `/`, `/lawsuits`, `/sitemap.xml`, and either
`/lawsuits/{slug}` + `/claim/{slug}` or the `/settlements/*` hub pages.
