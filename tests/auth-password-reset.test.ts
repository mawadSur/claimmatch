import { describe, expect, it } from 'vitest';
import { updatePasswordErrorMessage, validateNewPassword } from '@/components/auth/ResetPasswordForm';
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
  it('explains why Supabase refused the new password instead of always blaming the link', () => {
    expect(updatePasswordErrorMessage({ code: 'same_password', status: 422 })).toMatch(/current password/);
    expect(updatePasswordErrorMessage({ code: 'weak_password', status: 422 })).toMatch(/too easy to guess/);
    expect(updatePasswordErrorMessage({ name: 'AuthSessionMissingError', status: 400 })).toMatch(/expired/);
    expect(updatePasswordErrorMessage({ code: 'session_not_found', status: 403 })).toMatch(/expired/);
    expect(updatePasswordErrorMessage({ status: 429 })).toMatch(/Too many/);
    expect(updatePasswordErrorMessage({ status: 500 })).toMatch(/try again/i);
  });

  it('sends signed-in non-admins to the dashboard, signed-out visitors to log in', () => {
    expect(adminDeniedPath(true, '/admin/catalog')).toBe('/dashboard?denied=admin');
    expect(adminDeniedPath(false, '/admin/catalog')).toBe('/login?next=%2Fadmin%2Fcatalog');
  });
});
