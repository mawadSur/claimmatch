import { describe, expect, it } from 'vitest';
import { extractAdminEmail, noticeRequestLetter } from '@/lib/notice-request';

describe('notice request letter', () => {
  it('builds a copyable letter from the settlement row and never claims we send it', () => {
    const letter = noticeRequestLetter({
      title: 'Asure Software BIPA Settlement',
      slug: 'asure-software-bipa-settlement',
      administrator: 'Simpluris info@simpluris.com',
      officialHref: 'https://asurebipasettlement.com/',
    });
    expect(letter.administratorLabel).toBe('Simpluris');
    expect(letter.contactEmail).toBe('info@simpluris.com');
    expect(letter.subject).toContain('Asure Software BIPA Settlement');
    expect(letter.body).toContain('Lawsuit AI did not send this message');
    expect(letter.body).toContain('https://asurebipasettlement.com/');
    expect(letter.mailtoHref).toMatch(/^mailto:info%40simpluris\.com/);
    expect(letter.filename).toBe('notice-id-request-asure-software-bipa-settlement.txt');
  });

  it('falls back to a generic administrator when the row has no contact', () => {
    const letter = noticeRequestLetter({
      title: 'Example Settlement',
      slug: 'example',
      administrator: null,
      officialHref: null,
    });
    expect(letter.administratorLabel).toBe('the settlement administrator');
    expect(letter.contactEmail).toBeNull();
    expect(letter.mailtoHref).toBeNull();
    expect(letter.body).toContain('I do not have the official settlement website URL.');
    expect(extractAdminEmail('JND Legal Administration')).toBeNull();
  });
});
