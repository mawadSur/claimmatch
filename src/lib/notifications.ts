import { createServiceClient } from '@/lib/supabase/server';
import { sendMatchEmail, sendWelcomeEmail } from '@/lib/email';

/**
 * Notification layer: records every send in the `notifications` table (for the
 * user's activity feed + admin observability) and dispatches via the right
 * channel. Email goes through Resend (src/lib/email.ts); SMS is a documented
 * stub (wire Twilio here later). Never throws — a failed send is logged.
 */

function configured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

async function record(row: {
  user_id?: string | null;
  email?: string | null;
  channel?: string;
  type: string;
  subject?: string | null;
  body?: string | null;
  status?: string;
}): Promise<void> {
  if (!configured()) return;
  try {
    const supabase = createServiceClient();
    await supabase.from('notifications').insert({
      user_id: row.user_id ?? null,
      email: row.email ?? null,
      channel: row.channel ?? 'email',
      type: row.type,
      subject: row.subject ?? null,
      body: row.body ?? null,
      status: row.status ?? 'sent',
    });
  } catch (err) {
    console.error('[notifications] record failed:', err);
  }
}

export interface MatchNotifyItem {
  title: string;
  slug: string;
  typical_payout?: string | null;
  deadline?: string | null;
}

/** Notify a user about new matched settlements (email now; SMS optional). */
export async function notifyNewMatches(
  user: { id: string; email: string | null; full_name?: string | null },
  matches: MatchNotifyItem[],
): Promise<void> {
  if (!user.email || matches.length === 0) return;
  let status = 'sent';
  try {
    await sendMatchEmail(user.email, { name: user.full_name ?? undefined, matches });
  } catch (err) {
    status = 'failed';
    console.error('[notifications] match email failed:', err);
  }
  await record({
    user_id: user.id,
    email: user.email,
    type: 'new_matches',
    subject: `${matches.length} new settlement${matches.length === 1 ? '' : 's'} you may qualify for`,
    body: matches.map((m) => m.title).join(', '),
    status,
  });
}

export async function notifyWelcome(user: { id: string; email: string | null; full_name?: string | null }): Promise<void> {
  if (!user.email) return;
  let status = 'sent';
  try {
    await sendWelcomeEmail(user.email, user.full_name ?? undefined);
  } catch (err) {
    status = 'failed';
    console.error('[notifications] welcome email failed:', err);
  }
  await record({ user_id: user.id, email: user.email, type: 'welcome', subject: 'Welcome to ClaimMatch', status });
}

/**
 * SMS stub — records intent so the flow is complete end-to-end. Wire a provider
 * (Twilio) here: send, then set status based on the result.
 */
export async function notifySms(user: { id: string; phone: string | null }, type: string, body: string): Promise<void> {
  if (!user.phone) return;
  await record({ user_id: user.id, channel: 'sms', type, body, status: process.env.TWILIO_AUTH_TOKEN ? 'sent' : 'skipped' });
}
