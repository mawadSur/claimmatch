-- ClaimMatch — unpublish the 16 fictional seed settlements
-- Reversible update (not a delete). Mohammed or an admin runs this in
-- production after review. Do not edit 0001–0004.

update public.lawsuits
set
  review_status = 'rejected',
  status = 'closed',
  closed_at = coalesce(closed_at, now())
where slug in (
  'healthcare-provider-data-breach-2025',
  'prepaid-card-hidden-fees-settlement',
  'smart-tv-viewing-data-settlement',
  'defective-brake-system-settlement',
  'contaminated-eye-drops-settlement',
  'gig-driver-expense-reimbursement-settlement',
  'protein-powder-protein-spiking-settlement',
  'wireless-router-security-flaw-settlement',
  'nonstick-cookware-coating-settlement',
  'robocall-tcpa-settlement',
  'university-student-records-breach-settlement',
  'mortgage-late-fee-settlement',
  'voice-assistant-recording-settlement',
  'sunscreen-benzene-recall-settlement',
  'retail-off-the-clock-wages-settlement',
  'sparkling-water-natural-flavor-settlement'
);
