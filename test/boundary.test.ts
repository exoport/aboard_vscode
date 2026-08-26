// The line the whole test suite depends on: `vscode` is importable in exactly
// three files, and everything with a rule lives on the other side of it.
//
// Asserted rather than agreed to. The failure it prevents is silent and cheap to
// commit — one `import * as vscode` at the top of model.ts to reach a QuickPick,
// and the module that decides icon precedence, badge counts and what "dismiss"
// writes stops being loadable outside VS Code. Nothing else would complain: the
// bundle would still build.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';

const src = path.join(__dirname, '..', '..', 'src');

const ADAPTER = new Set(['extension.ts', 'tree.ts', 'panel.ts']);

describe('the vscode boundary', () => {
  const files = fs.readdirSync(src).filter((f) => f.endsWith('.ts'));

  it('has files on both sides of it', () => {
    assert.ok(files.length > ADAPTER.size, 'expected pure modules beside the adapter');
    for (const name of ADAPTER) {
      assert.ok(files.includes(name), `${name} is missing`);
    }
  });

  for (const file of fs.readdirSync(src).filter((f) => f.endsWith('.ts'))) {
    it(`${file} ${ADAPTER.has(file) ? 'may import vscode' : 'does not import vscode'}`, () => {
      const body = fs.readFileSync(path.join(src, file), 'utf8');
      const imports = /from\s+'vscode'|require\(\s*'vscode'\s*\)/.test(body);
      assert.equal(imports, ADAPTER.has(file), `${file}: unexpected vscode import state`);
    });
  }
});

describe('the pure modules load outside VS Code', () => {
  // Not a formality: requiring them here is what would actually throw if one of
  // them reached for `vscode` transitively through something else.
  for (const file of ['board', 'model', 'sse', 'launch', 'messages', 'tokens']) {
    it(`require('${file}')`, () => {
      assert.doesNotThrow(() => require(path.join(__dirname, '..', 'src', file)));
    });
  }
});
