/**
 * Minimal structured logger. Prefixes a tag and JSON-stringifies context so
 * production log lines are greppable and machine-parseable. Dependency-free
 * (console under the hood) on purpose — a future Sentry/OpenTelemetry
 * integration can wrap these three functions in one place.
 */

type LogContext = Record<string, unknown>;

function format(level: string, tag: string, message: string, context?: LogContext) {
  const line = `[${tag}] ${message}`;
  if (context && Object.keys(context).length > 0) {
    try {
      return `${line} ${JSON.stringify(context)}`;
    } catch {
      // Circular/unserializable context — degrade to a marker rather than throw.
      return `${line} {"_context":"unserializable"}`;
    }
  }
  return line;
}

export const log = {
  info(tag: string, message: string, context?: LogContext) {
    console.info(format('info', tag, message, context));
  },
  warn(tag: string, message: string, context?: LogContext) {
    console.warn(format('warn', tag, message, context));
  },
  error(tag: string, message: string, context?: LogContext) {
    console.error(format('error', tag, message, context));
  },
};
