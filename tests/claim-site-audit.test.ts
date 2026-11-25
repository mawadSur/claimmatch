import { describe, expect, it } from 'vitest';
import { looksLikeLogin, looksLikeSubmit } from '../scripts/claim-site-audit';

describe('claim-site-audit helpers', () => {
  it('detects notice-id login copy without treating every claim page as a login', () => {
    expect(looksLikeLogin('Claim Form Login. Enter your Unique ID and PIN.')).toBe(true);
    expect(looksLikeLogin('Submit a claim online. No notice required.')).toBe(false);
  });

  it('detects claim-form copy', () => {
    expect(looksLikeSubmit('File a claim by December 31')).toBe(true);
    expect(looksLikeSubmit('This settlement is paid automatically')).toBe(false);
  });
});
