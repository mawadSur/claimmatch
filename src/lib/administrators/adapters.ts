import type { Profile } from '@/lib/types';

/**
 * Future administrator API adapters. None ship a live client. DIRECT_FILING_ENABLED
 * must be on before any implementation is allowed to post.
 */

export type AdministratorAdapterResult =
  | { status: 'accepted'; administratorClaimId: string }
  | { status: 'rejected'; error: string }
  | { status: 'unsupported' };

export interface AdministratorAdapterInput {
  administratorSlug: string;
  lawsuitId: string;
  claimUrl: string | null;
  profile: Pick<Profile, 'full_name' | 'email' | 'phone' | 'state' | 'zip' | 'address_line1' | 'city'>;
  formData?: Record<string, unknown>;
}

export interface AdministratorApiAdapter {
  readonly slug: string;
  readonly filingMethod: 'api';
  submit(input: AdministratorAdapterInput): Promise<AdministratorAdapterResult>;
}

/** Default: no administrator API is wired. */
export class UnsupportedAdministratorAdapter implements AdministratorApiAdapter {
  readonly slug: string;
  readonly filingMethod = 'api' as const;

  constructor(slug: string) {
    this.slug = slug;
  }

  async submit(_input: AdministratorAdapterInput): Promise<AdministratorAdapterResult> {
    return { status: 'unsupported' };
  }
}

const registry = new Map<string, AdministratorApiAdapter>();

export function registerAdministratorAdapter(adapter: AdministratorApiAdapter): void {
  registry.set(adapter.slug, adapter);
}

export function getAdministratorAdapter(slug: string): AdministratorApiAdapter {
  return registry.get(slug) ?? new UnsupportedAdministratorAdapter(slug);
}

export function listRegisteredAdapters(): string[] {
  return [...registry.keys()].sort();
}
