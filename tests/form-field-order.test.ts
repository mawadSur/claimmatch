import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrefillPacket } from '@/components/claims/PrefillPacket';
import { defaultPacketFieldOrder, packetFieldOrder } from '@/lib/form-field-order';
import { makeProfile } from './helpers';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('packetFieldOrder', () => {
  it('keeps the default order when the flag is off or the list is empty', () => {
    expect(packetFieldOrder(['state', 'email'], false)).toEqual(defaultPacketFieldOrder());
    expect(packetFieldOrder(null, true)).toEqual(defaultPacketFieldOrder());
    expect(packetFieldOrder([], true)).toEqual(defaultPacketFieldOrder());
  });

  it('uses the stored official-form order and appends missing fields', () => {
    expect(packetFieldOrder(['state', 'email', 'bogus', 'state'], true)).toEqual([
      'state',
      'email',
      'full_name',
      'phone',
      'address_line1',
      'address_line2',
      'city',
    ]);
  });
});

describe('PrefillPacket field order', () => {
  it('lists fields in the stored order only when the flag is on', () => {
    const profile = makeProfile({
      full_name: 'Ada Lovelace',
      email: 'ada@example.com',
      prefill_consent_at: '2026-01-01T00:00:00Z',
    });
    const order = ['email', 'full_name', 'phone', 'address_line1', 'address_line2', 'city', 'state'];
    const off = renderToStaticMarkup(
      createElement(PrefillPacket, { profile, formFieldOrder: order }),
    );
    expect(off.indexOf('Full name')).toBeLessThan(off.indexOf('Email'));

    vi.stubEnv('FORM_FIELD_ORDER_ENABLED', '1');
    const on = renderToStaticMarkup(
      createElement(PrefillPacket, { profile, formFieldOrder: order }),
    );
    expect(on.indexOf('Email')).toBeLessThan(on.indexOf('Full name'));
    expect(on).toContain('Copy-ready details from your profile');
  });
});
