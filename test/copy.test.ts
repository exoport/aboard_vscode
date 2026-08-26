// Copy Reference and Copy Link to This Tab — two different things, two commands.
//
// **The defect this file exists for**, from the human's §11 run on 2026-08-26:
// *"copy id worked, there is no copy reference; there is copy link to this tab
// and it works"*. The command id was `aboard.copyReference`, its title was
// "Copy Link to This Tab", and it put a URL on the clipboard — so the one form
// the board's own documentation tells every agent to use when addressing a human
// (the name, with the id beside it) could not be copied from the sidebar at all.
//
// The commands are pressed here the way a human presses them: through the
// registered handler, with the tree node VS Code would hand a
// `view/item/context` item as its argument. That is why the stub records the
// node behind each rendered row — a test that called `referenceText()` directly
// would still pass with both menu items wired to the wrong function.

import * as assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { runExtension, startFakeBoard, until, type FakeBoard } from './fakeboard';
import type { RenderedRow } from './vscode-stub';

let board: FakeBoard;

before(async () => {
  board = await startFakeBoard();
});

after(async () => {
  await board.stop();
});

async function rows(): Promise<{ vscode: typeof import('./vscode-stub'); rows: RenderedRow[]; dispose(): void }> {
  const running = runExtension(board.projectDir);
  const found = await until('the tree to list the board’s tabs', 10_000, () => {
    const tabs = running.vscode.probe.rows.filter((r) => /^bb\d+$/.test(r.description ?? ''));
    return tabs.length > 0 ? tabs : undefined;
  });
  return { vscode: running.vscode, rows: found, dispose: running.dispose };
}

describe('the two copy commands', { timeout: 30_000 }, () => {
  it('copies a reference: the name, with the id beside it', async () => {
    const { vscode, rows: found, dispose } = await rows();
    try {
      const row = found.find((r) => r.description === 'bb1');
      assert.ok(row, 'the fake board’s first tab is missing from the tree');
      const copy = vscode.probe.commands.get('aboard.copyReference');
      assert.ok(copy, 'aboard.copyReference is not registered');
      await copy(row.node);
      assert.deepEqual(vscode.probe.clipboard, ['Migration review (bb1)']);
    } finally {
      dispose();
    }
  });

  it('copies a link: the deep link the board’s own menu builds', async () => {
    const { vscode, rows: found, dispose } = await rows();
    try {
      const row = found.find((r) => r.description === 'bb71');
      assert.ok(row);
      const copy = vscode.probe.commands.get('aboard.copyLink');
      assert.ok(copy, 'aboard.copyLink is not registered — the URL would have no command at all');
      await copy(row.node);
      assert.deepEqual(vscode.probe.clipboard, [`http://127.0.0.1:${board.port}/#tab=bb71`]);
    } finally {
      dispose();
    }
  });

  it('does not copy a link when asked for a reference', async () => {
    // The regression itself, stated as its own assertion: before this change
    // `aboard.copyReference` put a URL on the clipboard. Both commands existing
    // is not enough — the wiring is what was wrong.
    const { vscode, rows: found, dispose } = await rows();
    try {
      const row = found.find((r) => r.description === 'bb1')!;
      await vscode.probe.commands.get('aboard.copyReference')!(row.node);
      assert.doesNotMatch(vscode.probe.clipboard[0] ?? '', /^https?:/);
      assert.doesNotMatch(vscode.probe.clipboard[0] ?? '', /#tab=/);
    } finally {
      dispose();
    }
  });

  it('copies the bare id for a tab with no name', async () => {
    const { vscode, rows: found, dispose } = await rows();
    try {
      const row = found.find((r) => r.description === 'bb99');
      assert.ok(row, 'the unnamed tab is missing from the tree');
      assert.equal(row.label, '(unnamed)', 'the row should read as the board reads');
      await vscode.probe.commands.get('aboard.copyReference')!(row.node);
      // Not `(unnamed) (bb99)`: the board's placeholder is not a name.
      assert.deepEqual(vscode.probe.clipboard, ['bb99']);
    } finally {
      dispose();
    }
  });

  it('still copies the id on its own', async () => {
    const { vscode, rows: found, dispose } = await rows();
    try {
      const row = found.find((r) => r.description === 'bb71')!;
      await vscode.probe.commands.get('aboard.copyId')!(row.node);
      assert.deepEqual(vscode.probe.clipboard, ['bb71']);
    } finally {
      dispose();
    }
  });
});
