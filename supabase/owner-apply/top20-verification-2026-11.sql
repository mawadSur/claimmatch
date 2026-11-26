-- Owner-apply only. Do not run from CI. Do not apply to production until reviewed.
-- Catalog fixes from docs/top20-verification-2026-11.md (checked 2026-11-26
-- against official settlement sites). Never invents payouts.
--
-- Apply after 0053_requested_notice.sql if both are going in (0053 does not
-- touch lawsuits). Safe to re-run: backup rows are inserted once per id.
--
-- Rollback:
--   update public.lawsuits l
--      set claim_action_type = b.claim_action_type,
--          deadline = b.deadline,
--          claim_url = b.claim_url,
--          proof_required = b.proof_required
--     from public.lawsuits_top20_backup_2026_11 b
--    where l.id = b.id;
--   drop table if exists public.lawsuits_top20_backup_2026_11;

create table if not exists public.lawsuits_top20_backup_2026_11 as
select *
  from public.lawsuits
 where false;

insert into public.lawsuits_top20_backup_2026_11
select l.*
  from public.lawsuits l
 where l.slug in (
   'realpage-rental-software-antitrust-settlement',
   'john-deere-repair-services-antitrust-settlement',
   'toyota-airbag-control-unit-zf-trw-settlement',
   'camc-hernia-surgery-settlement',
   'hyundai-kia-vehicle-theft',
   'hyundai-and-kia-airbag-control-unit-settlement',
   'kroger-prescription-drug-prices-class-action-settlement',
   'kucoin-22m-new-york-enforcement-action-settlement',
   'costa-del-mar-sunglasses-repair-fee-settlement',
   'nextera-energy-retirement-plans',
   'steel-warehouse-company-data-breach-settlement',
   'asure-software-bipa-settlement',
   'seatgeek-ticket-fees-nevada-class-action-settlement',
   'harvard-morgue-class-action-settlement',
   'cbiz-data-breach-class-action-settlement',
   'educational-computer-systems-data-breach-class-action-settlement',
   'naro-v-walgreen-co',
   'phh-mortgage-1-5m-debt-collection-class-action-settlement',
   'public-agency-retirement-services-data-breach-class-action-settlement',
   'becton-dickinson-175m-sec-fair-fund-bdx'
 )
   and not exists (
     select 1 from public.lawsuits_top20_backup_2026_11 b where b.id = l.id
   );

-- KuCoin claim form requires Login ID & PIN from the mailed notice.
update public.lawsuits
   set claim_action_type = 'needs_notice_id'
 where slug = 'kucoin-22m-new-york-enforcement-action-settlement'
   and status = 'open'
   and review_status = 'published'
   and claim_action_type is distinct from 'needs_notice_id';

-- Steel Warehouse claim form requires LoginID and PIN.
update public.lawsuits
   set claim_action_type = 'needs_notice_id'
 where slug = 'steel-warehouse-company-data-breach-settlement'
   and status = 'open'
   and review_status = 'published'
   and claim_action_type is distinct from 'needs_notice_id';

-- Costa Del Mar official URL is a Unique ID / PIN login, not an automatic check.
update public.lawsuits
   set claim_action_type = 'needs_notice_id'
 where slug = 'costa-del-mar-sunglasses-repair-fee-settlement'
   and status = 'open'
   and review_status = 'published'
   and claim_action_type is distinct from 'needs_notice_id';

-- PARS / Phase II: homepage pays class members who do nothing.
-- Catalog deadline 2026-12-01 is the opt-out date, not a claim deadline.
update public.lawsuits
   set claim_action_type = 'automatic_payment',
       deadline = null
 where slug = 'public-agency-retirement-services-data-breach-class-action-settlement'
   and status = 'open'
   and review_status = 'published'
   and (
     claim_action_type is distinct from 'automatic_payment'
     or deadline is not null
   );

-- SeatGeek homepage is an open claim form (no notice ID). Canonical URL uses www.
update public.lawsuits
   set claim_action_type = 'online_form',
       claim_url = 'https://www.seatgeekticketfeessettlement.com/'
 where slug = 'seatgeek-ticket-fees-nevada-class-action-settlement'
   and status = 'open'
   and review_status = 'published'
   and (
     claim_action_type is distinct from 'online_form'
     or claim_url is distinct from 'https://www.seatgeekticketfeessettlement.com/'
   );

-- Toyota ACU homepage: mail the paper claim form, postmarked by 2028-12-11.
update public.lawsuits
   set claim_action_type = 'mail_in'
 where slug = 'toyota-airbag-control-unit-zf-trw-settlement'
   and status = 'open'
   and review_status = 'published'
   and claim_action_type is distinct from 'mail_in';

-- ECSI homepage: submit a claim form online or by mail; no PIN.
update public.lawsuits
   set claim_action_type = 'online_form'
 where slug = 'educational-computer-systems-data-breach-class-action-settlement'
   and status = 'open'
   and review_status = 'published'
   and claim_action_type is distinct from 'online_form';

-- CBIZ homepage: submit a claim form; no PIN on the homepage.
update public.lawsuits
   set claim_action_type = 'online_form'
 where slug = 'cbiz-data-breach-class-action-settlement'
   and status = 'open'
   and review_status = 'published'
   and claim_action_type is distinct from 'online_form';
