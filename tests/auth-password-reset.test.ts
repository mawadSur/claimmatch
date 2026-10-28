import { describe, expect, it } from 'vitest';
import { validateNewPassword } from '@/components/auth/ResetPasswordForm';
import { resetRedirectTo } from '@/components/auth/ForgotPasswordForm';
import { adminDeniedPath } from '@/lib/admin';

describe('password reset', () => {
  it('requires 10+ characters and a matching confirmation', () => {
    expect(validateNewPassword('short', 'short')).toMatch(/at least 10/);
    expect(validateNewPassword('longenough1', 'longenough2')).toMatch(/match/);
    expect(validateNewPassword('longenough1', 'longenough1')).toBeNull();
  });

  it('points the reset email at the scanner-safe confirm page', () => {
    expect(resetRedirectTo()).toMatch(/\/auth\/confirm\?type=recovery$/);
  });
});

describe('admin guard destinations', () => {
  it('sends signed-in non-admins to the dashboard, signed-out visitors to log in', () => {
    expect(adminDeniedPath(true, '/admin/catalog')).toBe('/dashboard?denied=admin');
    expect(adminDeniedPath(false, '/admin/catalog')).toBe('/login?next=%2Fadmin%2Fcatalog');
  });
});
