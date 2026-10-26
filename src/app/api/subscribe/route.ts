import { NextResponse } from 'next/server';

/**
 * The homepage "get matched by email" form is retired. Nothing ever read the
 * addresses it collected, and ClaimMatch sends no match emails, so this
 * endpoint no longer stores anything. Rows already in public.subscribers are
 * left as they are until the founder decides what to do with them.
 */
const GONE = {
  error:
    'This email sign-up has closed. Create a free account to keep track of settlement claims.',
};

export function POST() {
  return NextResponse.json(GONE, { status: 410 });
}

export function GET() {
  return NextResponse.json(GONE, { status: 410 });
}
