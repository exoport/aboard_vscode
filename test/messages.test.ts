import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseWebviewMessage } from '../src/messages';

describe('parseWebviewMessage', () => {
  it('accepts the active announcement', () => {
    assert.deepEqual(parseWebviewMessage({ type: 'active', tab: 'bb13' }), { type: 'active', tab: 'bb13' });
  });

  it('accepts the page saying it is ready', () => {
    assert.deepEqual(parseWebviewMessage({ type: 'ready' }), { type: 'ready' });
  });

  it('refuses everything else — a webview is input, not a caller', () => {
    assert.equal(parseWebviewMessage(undefined), undefined);
    assert.equal(parseWebviewMessage(null), undefined);
    assert.equal(parseWebviewMessage('active'), undefined);
    assert.equal(parseWebviewMessage({ type: 'goto', tab: 'bb1' }), undefined);
    assert.equal(parseWebviewMessage({ type: 'active' }), undefined);
    assert.equal(parseWebviewMessage({ type: 'active', tab: '' }), undefined);
    assert.equal(parseWebviewMessage({ type: 'active', tab: 3 }), undefined);
  });
});
