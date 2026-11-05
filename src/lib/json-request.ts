/**
 * True when the request's media type is JSON. A browser sends anything else
 * (a form, text/plain) cross-origin without a CORS preflight, cookies
 * included, so a route that changes data refuses it. Only the media type
 * counts: "text/plain; x=application/json" is still such a simple request.
 */
export function isJsonRequest(req: Request): boolean {
  const mediaType = req.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  return mediaType === 'application/json';
}
