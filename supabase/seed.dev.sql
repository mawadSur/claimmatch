-- ClaimMatch — DEV ONLY: made-up settlements for a LOCAL or STAGING database.
--
-- NEVER run this against production. None of these 16 settlements exist.
-- They (and the 4 made-up "sources" below) were published in production by
-- mistake through the old supabase/seed.sql; migration
-- 0005_unpublish_fictional.sql unpublishes them there. Their slugs are on the
-- fictional denylist (src/lib/fictional-slugs.ts), so the app hides them in
-- every environment: these rows exist to reproduce production's state and to
-- exercise the denylist and 0005. For sample settlements the local site shows,
-- run `CLAIMMATCH_ENV=local npm run seed` instead.
--
-- The file refuses to run unless the session opts in, so pasting it into the
-- production SQL editor fails before writing anything:
--   PGOPTIONS="-c claimmatch.allow_dev_seed=on" psql "$DATABASE_URL" -f supabase/seed.dev.sql
-- or, inside one psql session:
--   set claimmatch.allow_dev_seed = 'on';
--   \i supabase/seed.dev.sql
--
-- Idempotent: re-running is a no-op for existing slugs. Deadlines are relative
-- to the day the seed runs.

begin;

do $$
begin
  if coalesce(current_setting('claimmatch.allow_dev_seed', true), '') <> 'on' then
    raise exception 'seed.dev.sql writes made-up settlements and runs only on a local or staging database. Opt in with: set claimmatch.allow_dev_seed = ''on'';';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Sources (scraper provenance)
-- ---------------------------------------------------------------------------
insert into public.sources (slug, name, homepage_url, adapter, enabled) values
  ('top-class-actions', 'Top Class Actions Digest',     'https://topclassactions.example',   'generic',           true),
  ('class-action-org',  'ClassAction Directory',        'https://classaction.example',       'generic',           true),
  ('open-settlements',  'Open Settlements Feed',         'https://opensettlements.example',   'generic',           true),
  ('sample-aggregator', 'Sample Settlement Aggregator',  'https://sample-aggregator.example', 'sample-aggregator', true)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Lawsuits / settlements
-- ---------------------------------------------------------------------------
insert into public.lawsuits
  (slug, title, summary, description, category, status, typical_payout,
   proof_required, deadline, eligibility, eligibility_text,
   source_url, claim_url, is_featured, source_id, review_status)
values
  (
    'healthcare-provider-data-breach-2025',
    'Regional Health System Data Breach Settlement',
    'A hospital network exposed patient names, Social Security numbers, and insurance details. Affected patients can claim reimbursement plus credit-monitoring.',
    'The health system settled claims stemming from a breach that exposed protected health information. Class members may claim up to $200 for ordinary losses and lost time, documented out-of-pocket losses up to $5,000, and three years of credit monitoring.',
    'Data Breach', 'open', '$50–$200',
    false, (current_date + interval '55 days')::date,
    '{"requires":["had_data_breach"]}'::jsonb,
    'Anyone who received a breach notice from the health system.',
    null,
    null,
    true,
    (select id from public.sources where slug = 'top-class-actions'),
    'published'
  ),
  (
    'prepaid-card-hidden-fees-settlement',
    'Prepaid Debit Card Hidden Fees Settlement',
    'A prepaid card issuer charged undisclosed inactivity and service fees. Cardholders can claim automatic cash refunds — no receipts needed.',
    'The issuer settled allegations that it failed to clearly disclose monthly service and inactivity fees. Payments are calculated from account records and issued automatically to eligible cardholders.',
    'Financial & Banking', 'open', '$40–$300',
    false, (current_date + interval '70 days')::date,
    '{"requires":["used_banking"]}'::jsonb,
    'Anyone charged service or inactivity fees on the prepaid card during the class period.',
    null,
    null,
    true,
    (select id from public.sources where slug = 'class-action-org'),
    'published'
  ),
  (
    'smart-tv-viewing-data-settlement',
    'Smart TV Viewing-Data Privacy Settlement',
    'A smart-TV maker tracked what shows households watched and sold the data without clear consent. Owners in eligible states can file for a cash payment.',
    'The manufacturer settled claims that its automatic content recognition tracked viewing habits and shared them with advertisers without adequate disclosure. Eligible owners receive a pro-rata cash payment.',
    'Privacy', 'closing_soon', '$20–$90',
    false, (current_date + interval '25 days')::date,
    '{"requires":["used_streaming"],"states":["CA","IL","NY","WA"]}'::jsonb,
    'Residents of CA, IL, NY, or WA who owned the smart TV during the class period.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'open-settlements'),
    'published'
  ),
  (
    'defective-brake-system-settlement',
    'Defective Brake Booster Recall Settlement',
    'Certain SUVs and trucks shipped with a brake booster prone to corrosion. Owners can be reimbursed for repairs and receive an extended warranty.',
    'The automaker settled claims that a defective brake booster could reduce braking performance. Class members may claim repair reimbursement and an extended warranty on the covered component.',
    'Auto & Vehicles', 'open', 'Up to $1,500',
    true, (current_date + interval '110 days')::date,
    '{"requires":["owns_vehicle"],"anyOf":{"vehicle_brands":["Ford","GM","Toyota"]}}'::jsonb,
    'Owners or lessees of covered model-year vehicles.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'top-class-actions'),
    'published'
  ),
  (
    'contaminated-eye-drops-settlement',
    'Contaminated Eye Drops Recall Settlement',
    'Recalled over-the-counter eye drops were linked to infections. Buyers can claim a refund, and those with documented injuries can claim more.',
    'The manufacturer settled claims that certain eye-drop lots were contaminated with bacteria. Class members may claim a refund without proof, or a larger payment for documented medical treatment.',
    'Health & Pharma', 'open', '$15–$750',
    true, (current_date + interval '90 days')::date,
    '{"requires":["took_medication"]}'::jsonb,
    'Anyone who purchased or used the recalled eye drops during the class period.',
    null,
    null,
    true,
    (select id from public.sources where slug = 'class-action-org'),
    'published'
  ),
  (
    'gig-driver-expense-reimbursement-settlement',
    'Gig Driver Expense Reimbursement Settlement',
    'A delivery platform failed to reimburse drivers for mileage and phone costs. Drivers can claim back pay based on trips completed.',
    'The company settled claims that it misclassified drivers and failed to reimburse necessary business expenses. Payments are allocated by the number of trips a driver completed during the class period.',
    'Employment', 'open', '$75–$1,200',
    false, (current_date + interval '65 days')::date,
    '{"requires":["employed_hourly"],"states":["CA"]}'::jsonb,
    'California drivers who delivered on the platform during the class period.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'open-settlements'),
    'published'
  ),
  (
    'protein-powder-protein-spiking-settlement',
    'Protein Powder ''Protein Spiking'' Settlement',
    'A supplement brand overstated the protein content of its powder. Buyers can claim a per-unit refund up to a household cap.',
    'The company settled false-advertising claims that its protein powder contained less protein than labeled. Consumers may claim a fixed amount per container without a receipt, up to a household maximum.',
    'Food & Beverage', 'open', '$10–$60',
    false, (current_date + interval '80 days')::date,
    '{"requires":["bought_consumer_goods"],"dateRange":{"from":"2020-01-01","to":"2024-12-31"}}'::jsonb,
    'Anyone who bought the protein powder during the class period.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'top-class-actions'),
    'published'
  ),
  (
    'wireless-router-security-flaw-settlement',
    'Wireless Router Security-Flaw Settlement',
    'A router model shipped with a security flaw that exposed home networks. Owners can claim a rebate or reimbursement for a replacement.',
    'The manufacturer settled claims that a firmware vulnerability left home networks exposed and was not patched promptly. Owners may claim a rebate toward a replacement router or reimbursement for one already purchased.',
    'Technology', 'open', 'Up to $100',
    true, (current_date + interval '55 days')::date,
    '{"requires":["bought_consumer_goods"]}'::jsonb,
    'Owners of the affected router model during the class period.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'class-action-org'),
    'published'
  ),
  (
    'nonstick-cookware-coating-settlement',
    'Nonstick Cookware Coating Settlement',
    'A cookware brand claimed its nonstick coating was scratch-proof and durable when it was not. Buyers can claim a refund without a receipt for small claims.',
    'The company settled claims that it overstated the durability of its nonstick coating. Consumers may claim a per-item refund up to a household cap without proof of purchase, or more with receipts.',
    'Consumer Products', 'open', '$15–$80',
    false, (current_date + interval '75 days')::date,
    '{"requires":["bought_consumer_goods"]}'::jsonb,
    'Anyone who bought the cookware during the class period.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'open-settlements'),
    'published'
  ),
  (
    'robocall-tcpa-settlement',
    'Unwanted Robocall (TCPA) Settlement',
    'A marketing company placed automated calls and texts without consent. People who got them can file for a flat per-claim payment.',
    'The company settled claims that it violated the Telephone Consumer Protection Act by placing automated calls and texts without prior express consent. Eligible claimants receive a flat cash payment.',
    'General', 'open', '$40–$250',
    false, (current_date + interval '40 days')::date,
    '{"notes":"Received automated calls or texts to a cell phone during the class period."}'::jsonb,
    'Anyone who received unsolicited automated calls or texts during the class period.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'top-class-actions'),
    'published'
  ),
  (
    'university-student-records-breach-settlement',
    'University Student Records Breach Settlement',
    'A university vendor exposed student and alumni records, including SSNs. Affected people can claim reimbursement and credit monitoring.',
    'A third-party vendor breach exposed student and alumni personal information. Class members may claim reimbursement for out-of-pocket losses and enroll in credit-monitoring services.',
    'Data Breach', 'closing_soon', '$25–$150',
    false, (current_date + interval '30 days')::date,
    '{"requires":["had_data_breach"]}'::jsonb,
    'Students and alumni notified of the vendor data breach.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'class-action-org'),
    'published'
  ),
  (
    'mortgage-late-fee-settlement',
    'Mortgage Servicer Late-Fee Settlement',
    'A loan servicer charged improper late fees and property-inspection charges. Borrowers can claim automatic refunds from account records.',
    'The servicer settled claims that it assessed improper late fees and unnecessary property-inspection charges. Refunds are calculated from loan records and issued to affected borrowers.',
    'Financial & Banking', 'open', '$30–$400',
    false, (current_date + interval '100 days')::date,
    '{"requires":["used_banking"]}'::jsonb,
    'Borrowers charged the disputed fees during the class period.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'open-settlements'),
    'published'
  ),
  (
    'voice-assistant-recording-settlement',
    'Voice Assistant Recording Privacy Settlement',
    'A smart-speaker maker retained voice recordings, including accidental captures, without adequate consent. Users in eligible states can file for a payment.',
    'The company settled claims that its voice assistant stored recordings — including unintended activations — and used them without proper disclosure. Eligible users receive a pro-rata cash payment.',
    'Privacy', 'open', '$50–$300',
    false, (current_date + interval '85 days')::date,
    '{"requires":["uses_social_media"],"states":["IL","WA","CA"]}'::jsonb,
    'Residents of IL, WA, or CA who used the voice assistant during the class period.',
    null,
    null,
    true,
    (select id from public.sources where slug = 'top-class-actions'),
    'published'
  ),
  (
    'sunscreen-benzene-recall-settlement',
    'Sunscreen Benzene Recall Settlement',
    'Several spray sunscreens were recalled after testing found benzene. Buyers can claim a refund per product purchased — no receipt needed for small claims.',
    'The manufacturer recalled spray sunscreens after independent testing detected benzene, a known carcinogen. Consumers may claim a per-unit refund up to a household cap without proof of purchase.',
    'Health & Pharma', 'open', '$10–$50',
    false, (current_date + interval '60 days')::date,
    '{"requires":["bought_consumer_goods"]}'::jsonb,
    'Anyone who bought the recalled sunscreen during the class period.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'class-action-org'),
    'published'
  ),
  (
    'retail-off-the-clock-wages-settlement',
    'Retail Off-the-Clock Wages Settlement',
    'A retail chain required workers to complete security checks off the clock. Current and former hourly staff can claim unpaid wages.',
    'The retailer settled claims that it required employees to undergo bag checks and closing tasks without pay. Non-exempt workers during the class period share a fund allocated by hours worked.',
    'Employment', 'open', '$80–$900',
    false, (current_date + interval '95 days')::date,
    '{"requires":["employed_hourly"]}'::jsonb,
    'Current and former hourly retail employees during the class period.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'open-settlements'),
    'published'
  ),
  (
    'sparkling-water-natural-flavor-settlement',
    'Sparkling Water ''Natural Flavor'' Settlement',
    'A sparkling-water brand labeled drinks "naturally flavored" despite using synthetic additives. Buyers can claim a per-pack refund.',
    'The company settled false-advertising claims about its "natural flavor" labeling. Consumers may claim a fixed amount per pack purchased up to a household cap, without a receipt for small claims.',
    'Food & Beverage', 'open', '$8–$35',
    false, (current_date + interval '70 days')::date,
    '{"requires":["bought_consumer_goods"],"dateRange":{"from":"2021-01-01","to":"2024-12-31"}}'::jsonb,
    'Anyone who bought the sparkling water during the class period.',
    null,
    null,
    false,
    (select id from public.sources where slug = 'top-class-actions'),
    'published'
  )
on conflict (slug) do nothing;

commit;
