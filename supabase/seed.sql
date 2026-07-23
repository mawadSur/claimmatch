-- ClaimMatch — catalog seed data
-- Inserts a handful of scraper "sources" and a set of realistic settlement rows
-- into public.lawsuits. Idempotent: re-running is a no-op for existing slugs.
--
-- Apply with either:
--   supabase db reset            (runs migrations, then this seed)
--   psql "$DATABASE_URL" -f supabase/seed.sql
--
-- Deadlines are relative to the day the seed runs, so the catalog always looks
-- current. Eligibility JSON references the attribute keys defined in
-- src/lib/eligibility.ts (had_data_breach, employed_hourly, took_medication,
-- bought_consumer_goods, used_streaming, uses_social_media, owns_vehicle,
-- used_banking, …).

begin;

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
   source_url, claim_url, is_featured, source_id)
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
    'https://topclassactions.example/health-system-breach',
    'https://topclassactions.example/health-system-breach/claim',
    true,
    (select id from public.sources where slug = 'top-class-actions')
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
    'https://classaction.example/prepaid-card-fees',
    'https://classaction.example/prepaid-card-fees/claim',
    true,
    (select id from public.sources where slug = 'class-action-org')
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
    'https://opensettlements.example/smart-tv-privacy',
    'https://opensettlements.example/smart-tv-privacy/claim',
    false,
    (select id from public.sources where slug = 'open-settlements')
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
    'https://topclassactions.example/brake-booster-recall',
    'https://topclassactions.example/brake-booster-recall/claim',
    false,
    (select id from public.sources where slug = 'top-class-actions')
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
    'https://classaction.example/eye-drops-recall',
    'https://classaction.example/eye-drops-recall/claim',
    true,
    (select id from public.sources where slug = 'class-action-org')
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
    'https://opensettlements.example/gig-driver-expenses',
    'https://opensettlements.example/gig-driver-expenses/claim',
    false,
    (select id from public.sources where slug = 'open-settlements')
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
    'https://topclassactions.example/protein-spiking',
    'https://topclassactions.example/protein-spiking/claim',
    false,
    (select id from public.sources where slug = 'top-class-actions')
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
    'https://classaction.example/router-security',
    'https://classaction.example/router-security/claim',
    false,
    (select id from public.sources where slug = 'class-action-org')
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
    'https://opensettlements.example/nonstick-cookware',
    'https://opensettlements.example/nonstick-cookware/claim',
    false,
    (select id from public.sources where slug = 'open-settlements')
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
    'https://topclassactions.example/robocall-tcpa',
    'https://topclassactions.example/robocall-tcpa/claim',
    false,
    (select id from public.sources where slug = 'top-class-actions')
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
    'https://classaction.example/university-breach',
    'https://classaction.example/university-breach/claim',
    false,
    (select id from public.sources where slug = 'class-action-org')
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
    'https://opensettlements.example/mortgage-late-fees',
    'https://opensettlements.example/mortgage-late-fees/claim',
    false,
    (select id from public.sources where slug = 'open-settlements')
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
    'https://topclassactions.example/voice-assistant-privacy',
    'https://topclassactions.example/voice-assistant-privacy/claim',
    true,
    (select id from public.sources where slug = 'top-class-actions')
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
    'https://classaction.example/sunscreen-benzene',
    'https://classaction.example/sunscreen-benzene/claim',
    false,
    (select id from public.sources where slug = 'class-action-org')
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
    'https://opensettlements.example/retail-off-the-clock',
    'https://opensettlements.example/retail-off-the-clock/claim',
    false,
    (select id from public.sources where slug = 'open-settlements')
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
    'https://topclassactions.example/sparkling-water-flavor',
    'https://topclassactions.example/sparkling-water-flavor/claim',
    false,
    (select id from public.sources where slug = 'top-class-actions')
  )
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- Partners (referral-revenue catalog)
-- Sample partner services we route members to for a lead/referral fee. Fees are
-- in whole cents. These are placeholders (example.com) — replace with real,
-- contracted partners and payout terms before launch.
-- ---------------------------------------------------------------------------
insert into public.partners
  (slug, name, category, tagline, description, url, payout_model, lead_fee_cents, conversion_fee_cents, priority) values
  (
    'claimpros', 'ClaimPros', 'claims_service',
    'Full-service help for complex or high-value claims',
    'A licensed claims-filing service that handles the paperwork end-to-end for settlements that require proof or documentation you''d rather not chase yourself.',
    'https://partners.example.com/claimpros', 'hybrid', 300, 4000, 30
  ),
  (
    'settlement-counsel', 'Settlement Counsel LLP', 'law_firm',
    'Talk to an attorney about opting out or a larger claim',
    'A consumer-rights law firm for members who may have a larger individual claim or want legal advice before joining or opting out of a class.',
    'https://partners.example.com/settlement-counsel', 'per_lead', 800, 0, 20
  ),
  (
    'taxrelief-partners', 'TaxRelief Partners', 'tax',
    'Figure out if your settlement payout is taxable',
    'Settlement income can be taxable. These specialists review your payout and help you report it correctly — often a quick, free consultation.',
    'https://partners.example.com/taxrelief', 'per_conversion', 0, 2500, 10
  ),
  (
    'creditguard', 'CreditGuard', 'credit',
    'Monitor your credit after a data-breach settlement',
    'If you were part of a data-breach settlement, ongoing credit monitoring helps you catch misuse early. Free tier available.',
    'https://partners.example.com/creditguard', 'per_lead', 150, 0, 5
  )
on conflict (slug) do nothing;

commit;
