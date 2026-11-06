import { NextResponse } from 'next/server';

/** JSON 404 for unmatched or quoted API probes. Never returns the HTML 404 page. */
export function jsonApiNotFound(): NextResponse {
  return NextResponse.json({ error: 'Not found.' }, { status: 404 });
}

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

export function unmatchedApiHandlers(): Record<(typeof METHODS)[number], () => NextResponse> {
  const json = () => jsonApiNotFound();
  const head = () => new NextResponse(null, { status: 404, headers: { 'content-type': 'application/json' } });
  return {
    GET: json,
    POST: json,
    PUT: json,
    PATCH: json,
    DELETE: json,
    HEAD: head,
    OPTIONS: json,
  };
}
