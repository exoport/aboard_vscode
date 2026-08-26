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

describe('the streams never call setEncoding', () => {
  it('reads Buffers and decodes them itself', () => {
    // VS Code 1.134's extension host is Node 24. With a debugger attached (the
    // Extension Development Host, every F5) Node's inspector network
    // instrumentation adds its own `data` listener to every response and
    // reports `dataLength: chunk.byteLength`. A string has no byteLength, so
    // `res.setEncoding('utf8')` made that listener throw on every frame, the
    // parser reported `Parse Error: JS Exception`, and the event stream died
    // on each write — the sidebar showed a dot only after a manual Refresh.
    // Seen in the exthost log on 2026-08-26, twice, at the seconds two writes
    // landed. Buffers plus a StringDecoder are the whole fix; this keeps it.
    const src = path.join(__dirname, '..', '..', 'src');
    for (const file of fs.readdirSync(src)) {
      const body = fs.readFileSync(path.join(src, file), 'utf8');
      // Code only: the note in board.ts names the call it forbids.
      const hit = body.split('\n').findIndex((line) => !/^\s*(\/\/|\*)/.test(line) && /\.setEncoding\(/.test(line));
      assert.equal(hit, -1, `${file}:${hit + 1} calls setEncoding on a stream — Node 24's inspector kills the socket for a string chunk`);
    }
  });
});
