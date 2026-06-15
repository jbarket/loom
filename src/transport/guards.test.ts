/**
 * c-loom-transport boundary guards — bind-safety, auth gate, oversized guard.
 * Greens: ac-lt-bind-safety, ac-lt-auth-gate, ac-lt-oversized-guard.
 */
import { describe, it, expect } from 'vitest';
import {
  isSafeBindHost,
  assertSafeBind,
  checkBearer,
  checkPayloadSize,
  DEFAULT_MAX_BODY_BYTES,
} from './guards.js';

describe('c-loom-transport: bind-safety (ac-lt-bind-safety)', () => {
  it('refuses 0.0.0.0 and the bind-all wildcards', () => {
    for (const h of ['0.0.0.0', '::', '[::]', '', '*', '0:0:0:0:0:0:0:0']) {
      expect(isSafeBindHost(h)).toBe(false);
    }
  });

  it('refuses public/global addresses', () => {
    for (const h of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111']) {
      expect(isSafeBindHost(h)).toBe(false);
    }
  });

  it('allows loopback and mesh/private interfaces', () => {
    for (const h of [
      'localhost', '127.0.0.1', '127.0.0.53', '::1',
      '100.64.0.1', '100.115.92.3', // Tailscale CGNAT
      '10.0.0.5', '192.168.1.10', '172.16.0.1', '172.31.255.254',
      'fd7a:115c:a1e0::1', 'fe80::1', // ULA + link-local
    ]) {
      expect(isSafeBindHost(h)).toBe(true);
    }
  });

  it('assertSafeBind throws on a public/0.0.0.0 bind, passes on loopback/mesh', () => {
    expect(() => assertSafeBind('0.0.0.0')).toThrow(/unsafe-bind/);
    expect(() => assertSafeBind('8.8.8.8')).toThrow(/unsafe-bind/);
    expect(() => assertSafeBind('127.0.0.1')).not.toThrow();
    expect(() => assertSafeBind('100.64.0.1')).not.toThrow();
  });
});

describe('c-loom-transport: auth gate (ac-lt-auth-gate)', () => {
  it('refuses no/empty token when one is configured', () => {
    expect(checkBearer('secret', undefined).ok).toBe(false);
    expect(checkBearer('secret', '').ok).toBe(false);
    expect(checkBearer('secret', 'Bearer ').ok).toBe(false);
  });

  it('refuses a wrong token', () => {
    const r = checkBearer('secret', 'Bearer nope');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/unauthorized/);
  });

  it('accepts the correct token, with or without the Bearer scheme', () => {
    expect(checkBearer('secret', 'Bearer secret').ok).toBe(true);
    expect(checkBearer('secret', 'secret').ok).toBe(true);
  });

  it('allows any call when no token is configured (network is the boundary)', () => {
    expect(checkBearer(undefined, undefined).ok).toBe(true);
    expect(checkBearer('', 'anything').ok).toBe(true);
  });
});

describe('c-loom-transport: oversized guard (ac-lt-oversized-guard)', () => {
  it('refuses a body beyond the cap, before the handler', () => {
    const r = checkPayloadSize(DEFAULT_MAX_BODY_BYTES + 1, DEFAULT_MAX_BODY_BYTES);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/oversized/);
  });

  it('allows a body at or under the cap', () => {
    expect(checkPayloadSize(10, 1024).ok).toBe(true);
    expect(checkPayloadSize(1024, 1024).ok).toBe(true);
  });
});
