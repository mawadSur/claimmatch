/**
 * Build-time configuration. Expo inlines EXPO_PUBLIC_ variables only when they
 * are read as `process.env.EXPO_PUBLIC_NAME` (dot notation), so they are read
 * once here. Values come from mobile/.env.local or the EAS environment.
 */

export type EnvName = 'EXPO_PUBLIC_SUPABASE_URL' | 'EXPO_PUBLIC_SUPABASE_ANON_KEY' | 'EXPO_PUBLIC_API_BASE_URL';

export interface AppEnv {
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Origin (and optional base path) of the web API, without a trailing slash. */
  apiBaseUrl: string;
}

export interface EnvProblem {
  name: EnvName;
  problem: 'missing' | 'invalid';
}

export type EnvCheck = { ok: true; env: AppEnv } | { ok: false; problems: EnvProblem[] };

export type RawEnv = Partial<Record<EnvName, string | undefined>>;

/** The production web app. Always the apex: www redirects, and a redirect can drop the Authorization header. */
export const DEFAULT_API_BASE_URL = 'https://lawsuitai.org';

function parseHttpUrl(value: string, allowHttp: boolean): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || (allowHttp && url.protocol === 'http:')) return url;
  } catch {
    // Not a URL.
  }
  return null;
}

function withoutTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

/**
 * Validates the raw values. Plain http is accepted only in development
 * builds (a local API such as http://192.168.1.10:3000).
 */
export function parseEnv(raw: RawEnv, options: { allowHttp?: boolean } = {}): EnvCheck {
  const allowHttp = options.allowHttp ?? __DEV__;
  const problems: EnvProblem[] = [];

  const supabaseRaw = (raw.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
  const supabaseAnonKey = (raw.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const apiRaw = (raw.EXPO_PUBLIC_API_BASE_URL ?? '').trim() || DEFAULT_API_BASE_URL;

  const supabaseUrl = supabaseRaw ? parseHttpUrl(supabaseRaw, allowHttp) : null;
  if (!supabaseRaw) problems.push({ name: 'EXPO_PUBLIC_SUPABASE_URL', problem: 'missing' });
  else if (!supabaseUrl) problems.push({ name: 'EXPO_PUBLIC_SUPABASE_URL', problem: 'invalid' });

  if (!supabaseAnonKey) problems.push({ name: 'EXPO_PUBLIC_SUPABASE_ANON_KEY', problem: 'missing' });

  const apiUrl = parseHttpUrl(apiRaw, allowHttp);
  if (!apiUrl) problems.push({ name: 'EXPO_PUBLIC_API_BASE_URL', problem: 'invalid' });

  if (problems.length > 0 || !supabaseUrl || !apiUrl) return { ok: false, problems };

  if (apiUrl.hostname === 'www.lawsuitai.org') apiUrl.hostname = 'lawsuitai.org';

  return {
    ok: true,
    env: {
      supabaseUrl: withoutTrailingSlash(supabaseUrl.href),
      supabaseAnonKey,
      apiBaseUrl: withoutTrailingSlash(`${apiUrl.origin}${apiUrl.pathname}`),
    },
  };
}

export const envCheck: EnvCheck = parseEnv({
  EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
  EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  EXPO_PUBLIC_API_BASE_URL: process.env.EXPO_PUBLIC_API_BASE_URL,
});

/** The validated environment. The root layout renders the configuration error screen instead of the app when it is invalid. */
export function requireEnv(): AppEnv {
  if (!envCheck.ok) {
    throw new Error(`App configuration is incomplete: ${envCheck.problems.map((p) => p.name).join(', ')}`);
  }
  return envCheck.env;
}
