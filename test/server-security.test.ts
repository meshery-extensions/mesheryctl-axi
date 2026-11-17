import { afterEach, describe, expect, it } from 'vitest';
import type { ResolvedMesheryAuth } from '../src/config.js';
import { isLoopbackHost, serverGetJson, setServerAuth, setServerFetcher } from '../src/server.js';

function authFor(endpoint: string): ResolvedMesheryAuth {
  return {
    context: { name: 'test', endpoint, tokenName: 'default' },
    configPath: '/dev/null',
    tokenPath: '/dev/null',
    tokenValue: 'secret',
    providerValue: 'Meshery',
  };
}

const calls: { url: string; init: RequestInit }[] = [];

function recordingFetcher(): void {
  calls.length = 0;
  setServerFetcher(async (url, init) => {
    calls.push({ url, init });
    return new Response('{"ok":true}', { status: 200 });
  });
}

afterEach(() => {
  setServerAuth(undefined);
  setServerFetcher(undefined);
});

describe('isLoopbackHost', () => {
  it.each(['localhost', 'LOCALHOST', 'localhost.', '127.0.0.1', '127.1.2.3', '[::1]', '::1'])(
    '%s is loopback',
    (host) => expect(isLoopbackHost(host)).toBe(true),
  );

  it.each([
    'localhost.com',
    'localhost.evil.com',
    '127.0.0.1.evil.com',
    '128.0.0.1',
    '192.168.1.50',
    '10.0.0.5',
    '0.0.0.0',
    '[::2]',
    'meshery.example.com',
  ])('%s is not loopback', (host) => expect(isLoopbackHost(host)).toBe(false));
});

describe('serverGetJson transport security (#88)', () => {
  it.each([
    'http://localhost.com:9081',
    'http://127.0.0.1.evil.com',
    'http://192.168.1.50:9081',
    'http://meshery.example.com',
  ])('rejects authenticated request to %s without sending it', async (ep) => {
    recordingFetcher();
    setServerAuth(authFor(ep));
    await expect(serverGetJson({ path: 'api/x' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
    });
    expect(calls).toHaveLength(0);
  });

  it.each([
    'http://localhost:9081',
    'http://127.0.0.1:9081',
    'http://[::1]:9081',
    'https://meshery.example.com',
    'https://192.168.49.2:9081',
  ])('sends auth cookies to %s', async (ep) => {
    recordingFetcher();
    setServerAuth(authFor(ep));
    await expect(serverGetJson({ path: 'api/x' })).resolves.toEqual({
      ok: true,
    });
    expect(calls).toHaveLength(1);
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['Cookie']).toContain('token=secret');
  });

  it('reports an invalid endpoint as VALIDATION_ERROR', async () => {
    recordingFetcher();
    setServerAuth(authFor('not a url'));
    await expect(serverGetJson({ path: 'api/x' })).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      message: expect.stringContaining('Invalid Meshery endpoint'),
    });
    expect(calls).toHaveLength(0);
  });

  it('allows anonymous requests to remote http without cookies', async () => {
    recordingFetcher();
    setServerAuth(authFor('http://192.168.1.50:9081'));
    await expect(serverGetJson({ path: 'api/system/version', anonymous: true })).resolves.toEqual({
      ok: true,
    });
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers['Cookie']).toBeUndefined();
  });
});
