import { describe, expect, it } from 'vitest';
import { GET, POST } from '@/app/api/estimate/route';

describe('/api/estimate', () => {
  it('is retired (410) and therefore never returns a past-deadline match', async () => {
    for (const handler of [GET, POST]) {
      const res = await handler();
      expect(res.status).toBe(410);
      const body = await res.json();
      expect(body.code).toBe('gone');
      expect(body).not.toHaveProperty('matches');
      expect(body).not.toHaveProperty('total');
    }
  });
});
