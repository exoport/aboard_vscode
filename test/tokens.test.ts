// The two hex values are duplicated from aboard's app.css exactly once, in
// src/tokens.ts. The SVGs cannot import a TypeScript constant, so this asserts
// they still agree with it — which is what keeps "one place" true.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';

import { TOKENS } from '../src/tokens';

const media = path.join(__dirname, '..', '..', 'media');

describe('the status dots', () => {
  it('use --agent for a change', () => {
    const svg = fs.readFileSync(path.join(media, 'dot-change.svg'), 'utf8');
    assert.ok(svg.includes(TOKENS.agent), `dot-change.svg no longer carries ${TOKENS.agent}`);
  });

  it('use --danger for a removal request', () => {
    const svg = fs.readFileSync(path.join(media, 'dot-removal.svg'), 'utf8');
    assert.ok(svg.includes(TOKENS.danger), `dot-removal.svg no longer carries ${TOKENS.danger}`);
  });

  it('point at where the values came from', () => {
    for (const file of ['dot-change.svg', 'dot-removal.svg']) {
      assert.match(fs.readFileSync(path.join(media, file), 'utf8'), /app\.css/);
    }
  });
});
