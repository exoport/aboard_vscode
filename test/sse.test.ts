import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { SseParser, backoffDelay, classifyFrame } from '../src/sse';

describe('SseParser', () => {
  it('reads one frame', () => {
    const p = new SseParser();
    assert.deepEqual(p.push('data: {"origin":"vscode"}\n\n'), [{ origin: 'vscode' }]);
  });

  it('survives a chunk boundary inside the JSON', () => {
    const p = new SseParser();
    assert.deepEqual(p.push('data: {"orig'), []);
    assert.deepEqual(p.push('in":"cli"}\n\n'), [{ origin: 'cli' }]);
  });

  it('reads several frames from one chunk', () => {
    const p = new SseParser();
    assert.deepEqual(p.push('data: {"waiters":2}\n\ndata: {"origin":null}\n\n'), [{ waiters: 2 }, { origin: null }]);
  });

  it('ignores the retry line the board opens with', () => {
    const p = new SseParser();
    assert.deepEqual(p.push('retry: 1000\n\ndata: {"ui":{"sig":"x"}}\n\n'), [{ ui: { sig: 'x' } }]);
  });

  it('ignores comment lines', () => {
    const p = new SseParser();
    assert.deepEqual(p.push(': keep-alive\n\ndata: {"origin":"a"}\n\n'), [{ origin: 'a' }]);
  });

  it('joins a multi-line data field', () => {
    const p = new SseParser();
    assert.deepEqual(p.push('data: {"origin":\ndata: "split"}\n\n'), [{ origin: 'split' }]);
  });

  it('drops a frame that is not JSON rather than tearing the stream down', () => {
    const p = new SseParser();
    assert.deepEqual(p.push('data: not json\n\ndata: {"origin":"a"}\n\n'), [{ origin: 'a' }]);
  });

  it('handles CRLF', () => {
    const p = new SseParser();
    assert.deepEqual(p.push('data: {"waiters":1}\r\n\r\n'), [{ waiters: 1 }]);
  });
});

describe('classifyFrame', () => {
  it('tells the three kinds apart by key', () => {
    assert.deepEqual(classifyFrame({ origin: 'vscode' }), { kind: 'state', origin: 'vscode' });
    assert.deepEqual(classifyFrame({ origin: null }), { kind: 'state', origin: null });
    assert.deepEqual(classifyFrame({ waiters: 3 }), { kind: 'waiters', count: 3 });
    assert.deepEqual(classifyFrame({ ui: { sig: 'abc' } }), { kind: 'ui' });
  });

  it('calls anything else unknown rather than guessing', () => {
    assert.deepEqual(classifyFrame({ hello: 1 }), { kind: 'unknown' });
    assert.deepEqual(classifyFrame(null), { kind: 'unknown' });
    assert.deepEqual(classifyFrame(42), { kind: 'unknown' });
  });
});

describe('backoffDelay', () => {
  it('starts at the board’s own retry hint and doubles to a cap', () => {
    assert.equal(backoffDelay(1), 1000);
    assert.equal(backoffDelay(2), 2000);
    assert.equal(backoffDelay(3), 4000);
    assert.equal(backoffDelay(20), 30_000);
  });
});
