import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { __test__ } from '../tools/overleaf-discovery.mjs';

const {
  COOKIE_PLACEHOLDER,
  executeRequest,
  loadConfig,
  parseCompilePayload,
  sanitizeCookieHeaderValue,
} = __test__;

async function withTempDir(callback) {
  const dir = mkdtempSync(join(tmpdir(), 'overleaf-skill-test-'));
  try {
    return await callback(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function writeSettingsFixture(dir, source) {
  const path = join(dir, 'overleaf-agent.settings.json');
  writeFileSync(path, JSON.stringify(source, null, 2) + '\n', 'utf8');
  return path;
}

test('sanitizeCookieHeaderValue treats placeholder as missing auth', () => {
  assert.equal(sanitizeCookieHeaderValue(COOKIE_PLACEHOLDER), '');
  assert.equal(sanitizeCookieHeaderValue('   '), '');
  assert.equal(sanitizeCookieHeaderValue('real=1'), 'real=1');
});

test('loadConfig ignores placeholder cookie values for status', () => {
  return withTempDir(async (dir) => {
    const configPath = writeSettingsFixture(dir, {
      $schema: './overleaf-agent.settings.schema.json',
      defaultProfile: 'personal',
      profiles: {
        personal: {
          cookieHeader: COOKIE_PLACEHOLDER,
        },
      },
    });

    const config = loadConfig('status', { config: configPath }, []);
    assert.equal(config.cookieHeader, undefined);
  });
});

test('loadConfig for connect with stdin prefers incoming cookie over stored placeholder', () => {
  return withTempDir(async (dir) => {
    const configPath = writeSettingsFixture(dir, {
      $schema: './overleaf-agent.settings.schema.json',
      defaultProfile: 'personal',
      profiles: {
        personal: {
          cookieHeader: COOKIE_PLACEHOLDER,
        },
      },
    });

    const config = loadConfig('connect', { config: configPath, cookieStdin: true }, []);
    assert.equal(config.cookieHeader, undefined);
    assert.equal(config.cookieStdin, true);
  });
});

test('parseCompilePayload supports hosted top-level compile responses', () => {
  const payload = parseCompilePayload({
    status: 'success',
    outputFiles: [
      { path: 'output.log', url: '/build/output.log', type: 'log' },
      { path: 'output.pdf', url: '/build/output.pdf', type: 'pdf', build: 'build-1' },
    ],
  });

  assert.equal(payload?.status, 'success');
  assert.equal(payload?.outputFiles.length, 2);
  assert.deepEqual(payload?.outputFiles[1], {
    path: 'output.pdf',
    url: '/build/output.pdf',
    type: 'pdf',
    build: 'build-1',
  });
});

test('executeRequest omits GET bodies', async () => {
  const originalFetch = globalThis.fetch;
  const seen = [];

  globalThis.fetch = async (_url, init) => {
    seen.push(init);
    return new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } });
  };

  try {
    await executeRequest(
      {
        method: 'GET',
        url: 'https://example.com/test',
        headers: {},
        body: 'should-not-be-sent',
      },
      { timeoutMs: 15000 }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(seen.length, 1);
  assert.equal('body' in seen[0], false);
});
