import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/server';
import { rateLimit, ipKey } from '@/lib/ratelimit';

export const runtime = 'nodejs';

const SubscribeSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  // Lenient: an odd state value never blocks a valid email signup — we only
  // persist a clean 2-letter code, otherwise null.
  state: z.string().trim().optional().nullable(),
});

/** Normalize a free-form state input to a 2-letter uppercase code or null. */
function normalizeState(raw?: string | null): string | null {
  if (!raw) return null;
  const code = raw.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

const SUCCESS = "You're on the list — we'll email you when a match opens.";

function supabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}

export async function POST(req: Request) {
  const limit = rateLimit(ipKey(req));
  if (!limit.ok) {
    return NextResponse.json(
      { error: 'Too many requests, please slow down.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const parsed = SubscribeSchema.safeParse(body);
  if (!parsed.success) {
    const error = parsed.error.issues[0]?.message || 'Invalid input.';
    return NextResponse.json({ error }, { status: 400 });
  }

  const { email } = parsed.data;
  const state = normalizeState(parsed.data.state);

  // No DB configured (local/preview before Supabase is set up): treat as a
  // successful no-op so the UI flow still works.
  if (!supabaseConfigured()) {
    return NextResponse.json({ message: SUCCESS });
  }

  try {
    const supabase = createServiceClient();
    // Insert-or-ignore on the unique email constraint: a duplicate signup is a
    // success from the user's perspective.
    const { error } = await supabase
      .from('subscribers')
      .upsert(
        { email, state },
        { onConflict: 'email', ignoreDuplicates: true },
      );

    if (error && error.code !== '23505') {
      // Log unexpected DB errors but still confirm to the user so the capture
      // form never dead-ends.
      console.error('[subscribe] insert failed:', error);
    }
  } catch (err) {
    console.error('[subscribe] unexpected error:', err);
  }

  return NextResponse.json({ message: SUCCESS });
}
