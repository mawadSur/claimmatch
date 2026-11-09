import { common } from '@/copy/common';
import { ApiRequestError } from '@/lib/api';

/**
 * Every data hook fails with an ApiRequestError, whose `message` is the text
 * to show: the server's own error (errorMessageFor already rewords the
 * "Refresh the page" texts), the network message, or the generic one.
 * Screens never show raw Supabase or parser messages.
 */

/** A failure as a screen shows it. */
export interface UserFacingError {
  /** Text to show. */
  message: string;
  /** The server's code (for example 'window_closed', 'claim_changed'), 'network', 'invalid_input' or null. */
  code: string | null;
  /** HTTP status, or 0 when there was no answer. */
  status: number;
  /** True when the request signed the user out on this device. */
  loggedOut: boolean;
}

/** Any error from a data hook as text a screen can show; null for no error. */
export function userFacingError(error: unknown): UserFacingError | null {
  if (error == null) return null;
  if (error instanceof ApiRequestError) {
    return { message: error.message, code: error.code, status: error.status, loggedOut: error.loggedOut };
  }
  return { message: common.genericError.text, code: null, status: 0, loggedOut: false };
}

/** Input refused on the device before sending, with the same text the server would answer. */
export function invalidInput(message: string): ApiRequestError {
  return new ApiRequestError({ ok: false, status: 400, code: 'invalid_input', error: message, loggedOut: false });
}

/** A 2xx answer whose shape the app cannot read. */
export function invalidResponse(status = 200): ApiRequestError {
  return new ApiRequestError({
    ok: false,
    status,
    code: 'invalid_response',
    error: common.genericError.text,
    loggedOut: false,
  });
}

/**
 * A failed Supabase (PostgREST) read. postgrest-js reports a request that
 * never got an answer with status 0; that is the network message, anything
 * else the generic one.
 */
export function supabaseReadError(error: { code?: string | null } | null, status: number): ApiRequestError {
  const offline = !status;
  return new ApiRequestError({
    ok: false,
    status: offline ? 0 : status,
    code: offline ? 'network' : error?.code || 'supabase_error',
    error: offline ? common.networkError.text : common.genericError.text,
    loggedOut: false,
  });
}
