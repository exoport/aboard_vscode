import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { acceptHealth, basePathOf, normaliseBasePath, type Instance } from '../src/board';

const live = (over: Partial<Instance> = {}): unknown => ({
  app: 'aboard',
  project: '/home/dev/project',
  port: 41234,
  version: '0.9.0',
  ...over,
});

describe('acceptHealth', () => {
  it('accepts the standalone binary', () => {
    assert.deepEqual(acceptHealth(live(), '/home/dev/project'), { ok: true });
  });

  it('accepts ape-aboard, which serves the same board', () => {
    assert.deepEqual(acceptHealth(live({ app: 'ape-aboard' }), '/home/dev/project'), { ok: true });
  });

  it('refuses another project answering on this port', () => {
    const verdict = acceptHealth(live({ project: '/home/dev/other' }), '/home/dev/project');
    assert.equal(verdict.ok, false);
    assert.match((verdict as { reason: string }).reason, /\/home\/dev\/other/);
  });

  it('refuses something that is not a board at all', () => {
    const verdict = acceptHealth({ status: 'ok' }, '/home/dev/project');
    assert.equal(verdict.ok, false);
    assert.match((verdict as { reason: string }).reason, /other than a board/);
  });

  it('refuses a non-object body', () => {
    assert.equal(acceptHealth('ok', '/home/dev/project').ok, false);
  });

  it('ignores a trailing slash on either side', () => {
    assert.deepEqual(acceptHealth(live({ project: '/home/dev/project/' }), '/home/dev/project'), { ok: true });
  });
});

describe('base path', () => {
  it('is empty for the common case', () => {
    assert.equal(normaliseBasePath(undefined), '');
    assert.equal(normaliseBasePath(''), '');
    assert.equal(normaliseBasePath('/'), '');
  });

  it('gains a leading slash and loses a trailing one', () => {
    assert.equal(normaliseBasePath('prefix'), '/prefix');
    assert.equal(normaliseBasePath('/prefix/'), '/prefix');
  });

  it('reads the field the server actually sends, and the one the brief expected', () => {
    assert.equal(basePathOf({ app: 'aboard', project: '/p', port: 1, base: '/board' }), '/board');
    assert.equal(basePathOf({ app: 'aboard', project: '/p', port: 1, basePath: '/board' }), '/board');
    assert.equal(basePathOf({ app: 'aboard', project: '/p', port: 1 }), '');
  });
});
