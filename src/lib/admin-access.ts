import { createServiceClient } from '@/lib/supabase/server';

export type AdminAccessAction = 'list' | 'detail' | 'reveal';

export async function logAdminAccess(input: {
  adminId: string;
  action: AdminAccessAction;
  targetUserId?: string | null;
  path?: string;
}): Promise<void> {
  try {
    const svc = createServiceClient();
    const { error } = await svc.from('admin_access_log').insert({
      admin_id: input.adminId,
      target_user_id: input.targetUserId ?? null,
      action: input.action,
      path: input.path ?? null,
    });
    if (error) console.error('[admin-access] log failed', { code: error.code });
  } catch (err) {
    console.error('[admin-access] log failed', err);
  }
}

export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!local || !domain) return '•••';
  const localKeep = local.slice(0, 1);
  const domainKeep = domain.slice(0, 1);
  return `${localKeep}•••@${domainKeep}•••`;
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '•••';
  return `${phone.slice(0, 2)}••••${phone.slice(-2)}`;
}

export function maskName(name: string | null | undefined): string | null {
  if (!name) return null;
  const parts = name.trim().split(/\s+/);
  return parts.map((part) => (part ? `${part[0]}•••` : '')).join(' ');
}
