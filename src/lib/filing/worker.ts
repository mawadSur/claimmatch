import type { FormFieldMapping, Profile } from '@/lib/types';

/**
 * Server-side filing worker. Implementations fill an official form from a
 * per-administrator mapping and report the outcome. Tests inject a mock;
 * they must never talk to a real administrator site.
 */

export type FilingWorkerNeedsUser = 'captcha' | 'missing_info';

export interface FilingWorkerInput {
  jobId: string;
  claimId: string;
  lawsuitId: string;
  claimUrl: string | null;
  mapping: FormFieldMapping;
  profile: Pick<
    Profile,
    | 'full_name'
    | 'email'
    | 'phone'
    | 'state'
    | 'zip'
    | 'address_line1'
    | 'address_line2'
    | 'city'
  >;
}

export type FilingWorkerResult =
  | {
      status: 'submitted';
      administratorClaimId: string;
      screenshotUrl: string | null;
    }
  | {
      status: 'needs_user';
      reason: FilingWorkerNeedsUser;
      detail?: string;
    }
  | {
      status: 'failed';
      error: string;
    };

export interface FilingWorker {
  readonly kind: 'playwright' | 'browserbase' | 'mock';
  fillAndSubmit(input: FilingWorkerInput): Promise<FilingWorkerResult>;
}

export type FilingWorkerFactory = () => FilingWorker;

let override: FilingWorkerFactory | null = null;

/** Tests replace the worker. Production code uses createFilingWorker(). */
export function setFilingWorkerFactory(factory: FilingWorkerFactory | null): void {
  override = factory;
}

export function createFilingWorker(): FilingWorker {
  if (override) return override();
  const kind = (process.env.FILING_WORKER || 'playwright').toLowerCase();
  if (kind === 'browserbase') {
    // Hosted-browser slot: same interface, no live calls in this stub.
    return new PlaywrightFilingWorker('browserbase');
  }
  if (kind === 'mock') {
    return new MockFilingWorker();
  }
  return new PlaywrightFilingWorker('playwright');
}

/**
 * Playwright-shaped stub. It never launches a browser and never posts to an
 * official form. Swap the body for a real Playwright or Browserbase session
 * after counsel review.
 */
export class PlaywrightFilingWorker implements FilingWorker {
  readonly kind: 'playwright' | 'browserbase';

  constructor(kind: 'playwright' | 'browserbase' = 'playwright') {
    this.kind = kind;
  }

  async fillAndSubmit(input: FilingWorkerInput): Promise<FilingWorkerResult> {
    if (!input.claimUrl) {
      return { status: 'needs_user', reason: 'missing_info', detail: 'No official claim URL is stored.' };
    }
    if (!input.mapping.fields?.length) {
      return { status: 'needs_user', reason: 'missing_info', detail: 'No form mapping is stored for this administrator.' };
    }
    return {
      status: 'failed',
      error: 'The browser worker is a stub. No official form was submitted.',
    };
  }
}

/** Deterministic in-process worker for tests. Never contacts a network. */
export class MockFilingWorker implements FilingWorker {
  readonly kind = 'mock' as const;
  readonly calls: FilingWorkerInput[] = [];
  nextResult: FilingWorkerResult = {
    status: 'failed',
    error: 'Mock worker has no programmed result.',
  };

  async fillAndSubmit(input: FilingWorkerInput): Promise<FilingWorkerResult> {
    this.calls.push(input);
    return this.nextResult;
  }
}
