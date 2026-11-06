import { unmatchedApiHandlers } from '@/lib/api-not-found';

/**
 * Unmatched /api/* paths, including probes like /api/health/schema' that
 * used to fall through to the HTML 404 (and then a PostHog $pageview).
 * More specific app/api catch-all siblings still win over this route.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = unmatchedApiHandlers();

export const GET = handlers.GET;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
export const HEAD = handlers.HEAD;
export const OPTIONS = handlers.OPTIONS;
