import { describe, expect, it } from 'vitest';
import { Allowlist, BlockedUrlError } from '../src/safety/allowlist.ts';

const al = new Allowlist({ ports: [4173] });

describe('Allowlist', () => {
  it.each([
    'http://127.0.0.1:4173/bookshop/',
    'http://localhost:4173/docs/page/proxy?tab=notes',
    'http://[::1]:4173/',
    'about:blank',
  ])('allows %s', (u) => {
    expect(al.check(u).ok).toBe(true);
  });

  it.each([
    ['https://example.com', 'scheme'],
    ['http://example.com/', 'loopback'],
    ['http://127.0.0.1:9999/', 'port'],
    ['http://127.0.0.1/', 'port 80'],
    ['http://user:pw@127.0.0.1:4173/', 'credentials'],
    ['http://127.0.0.1.evil.test:4173/', 'host lookalike'],
    ['file:///etc/passwd', 'scheme'],
    ['javascript:alert(1)', 'scheme'],
    ['data:text/html,hi', 'scheme'],
    ['not a url', 'valid'],
    ['//example.com/x', 'valid'],
  ])('blocks %s (%s)', (u, hint) => {
    const r = al.check(u);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain(hint.split(' ')[0]);
  });

  it('assert() throws a BlockedUrlError with a clear message', () => {
    expect(() => al.assert('https://example.com')).toThrow(BlockedUrlError);
    try {
      al.assert('https://example.com');
    } catch (e) {
      expect((e as Error).message).toContain('only drives the local demo apps');
    }
  });

  it('honours the configured port list', () => {
    expect(new Allowlist({ ports: [5000, 5001] }).isAllowed('http://127.0.0.1:5001/')).toBe(true);
    expect(new Allowlist({ ports: [5000] }).isAllowed('http://127.0.0.1:4173/')).toBe(false);
  });
});
