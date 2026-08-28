import * as assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseWebviewMessage } from '../src/messages';

describe('parseWebviewMessage', () => {
  it('accepts the active announcement', () => {
    assert.deepEqual(parseWebviewMessage({ type: 'active', tab: 'ab13' }), { type: 'active', tab: 'ab13' });
  });

  it('accepts the page saying it is ready', () => {
    assert.deepEqual(parseWebviewMessage({ type: 'ready' }), { type: 'ready' });
  });

  it('accepts the page’s report of the editor’s variables', () => {
    assert.deepEqual(
      parseWebviewMessage({
        type: 'theme',
        vars: { '--vscode-editor-background': '#1f1f1f' },
        bodyClass: 'vscode-dark',
      }),
      { type: 'theme', vars: { '--vscode-editor-background': '#1f1f1f' }, bodyClass: 'vscode-dark' },
    );
  });

  it('drops the variables this window does not have, so absent is one case downstream', () => {
    // `getPropertyValue` answers `''` for a variable the theme never defined,
    // and the page reports every name it was told to read rather than deciding
    // for itself. An empty string is not a colour: dropping it here is what lets
    // `mapVscodeTheme` ask one question — is there a value? — instead of two.
    const parsed = parseWebviewMessage({
      type: 'theme',
      vars: { '--vscode-focusBorder': '', '--vscode-panel-border': '  #2b2b2b  ', '--vscode-charts-red': 7 },
      bodyClass: '',
    });
    assert.deepEqual(parsed, { type: 'theme', vars: { '--vscode-panel-border': '#2b2b2b' }, bodyClass: '' });
  });

  it('refuses everything else — a webview is input, not a caller', () => {
    assert.equal(parseWebviewMessage(undefined), undefined);
    assert.equal(parseWebviewMessage(null), undefined);
    assert.equal(parseWebviewMessage('active'), undefined);
    assert.equal(parseWebviewMessage({ type: 'goto', tab: 'ab1' }), undefined);
    assert.equal(parseWebviewMessage({ type: 'active' }), undefined);
    assert.equal(parseWebviewMessage({ type: 'active', tab: '' }), undefined);
    assert.equal(parseWebviewMessage({ type: 'active', tab: 3 }), undefined);
    assert.equal(parseWebviewMessage({ type: 'theme', vars: {} }), undefined);
    assert.equal(parseWebviewMessage({ type: 'theme', bodyClass: 'vscode-dark' }), undefined);
    assert.equal(parseWebviewMessage({ type: 'theme', vars: null, bodyClass: '' }), undefined);
    assert.equal(parseWebviewMessage({ type: 'theme', vars: {}, bodyClass: 3 }), undefined);
  });
});

describe('parseWebviewMessage — clipboard-image', () => {
  // The board asking the host to write a PNG to the system clipboard. Validated
  // here because the payload is about to be decoded, written to disk and handed
  // to another program: the shape check and the content check are two different
  // jobs, and this is the first one.
  it('accepts the shape the board sends', () => {
    assert.deepEqual(
      parseWebviewMessage({ type: 'clipboard-image', id: 3, dataUrl: 'data:image/png;base64,AAAA' }),
      { type: 'clipboard-image', id: 3, dataUrl: 'data:image/png;base64,AAAA' },
    );
  });

  it('refuses one with the wrong types', () => {
    assert.equal(parseWebviewMessage({ type: 'clipboard-image', id: '3', dataUrl: 'x' }), undefined);
    assert.equal(parseWebviewMessage({ type: 'clipboard-image', id: 3 }), undefined);
    assert.equal(parseWebviewMessage({ type: 'clipboard-image', id: 3, dataUrl: 42 }), undefined);
    // NaN is a number and is not an id: it matches nothing on the way back, so a
    // reply carrying it could never be paired with its request.
    assert.equal(parseWebviewMessage({ type: 'clipboard-image', id: NaN, dataUrl: 'x' }), undefined);
  });
});
