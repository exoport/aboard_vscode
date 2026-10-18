// Quiet and Announce, pressed through their registered handlers against a board
// that drops `quiet` — which is every board before aboard v0.4.0.
//
// The failure this file is for is the one the repo is organised around: the old
// board answers 200 and decodes the key away, so without the read-back the row
// would go on offering "Quiet" after every click and nothing would say why. What
// a v0.4.0 board does with the field is `test/integration.test.ts`'s question.

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
    const tabs = running.vscode.probe.rows.filter((r) => /^ab\d+$/.test(r.description ?? ''));
    return tabs.length > 0 ? tabs : undefined;
  });
  return { vscode: running.vscode, rows: found, dispose: running.dispose };
}

describe('quiet, on a board that drops it', { timeout: 30_000 }, () => {
  it('writes quiet: true as the human, then says the board threw it away', async () => {
    const { vscode, rows: found, dispose } = await rows();
    try {
      const row = found.find((r) => r.description === 'ab71');
      assert.ok(row);
      const quiet = vscode.probe.commands.get('aboard.quiet');
      assert.ok(quiet, 'aboard.quiet is not registered');
      await quiet(row.node);

      const sent = board.writes.at(-1) as { __by?: string; tabs: Array<{ id: string; quiet?: unknown }> } | undefined;
      assert.ok(sent, 'nothing was posted');
      assert.equal(sent.__by, 'human');
      assert.equal(sent.tabs.find((t) => t.id === 'ab71')?.quiet, true);

      const warnings = vscode.probe.notifications.filter((n) => n.level === 'warning');
      assert.equal(warnings.length, 1, `expected one warning, got ${JSON.stringify(vscode.probe.notifications)}`);
      assert.match(warnings[0]!.message, /dropped `quiet`/);
      assert.match(warnings[0]!.message, /older than aboard v0\.4\.0/);
      // The version the board reports, so the human knows what to upgrade.
      assert.match(warnings[0]!.message, /93ba033/);
    } finally {
      dispose();
    }
  });

  it('posts nothing to announce a tab that is not quiet', async () => {
    const { vscode, rows: found, dispose } = await rows();
    try {
      const before = board.writes.length;
      await vscode.probe.commands.get('aboard.announce')!(found.find((r) => r.description === 'ab1')!.node);
      assert.equal(board.writes.length, before, 'clearing a quiet that was never set stamped a new revision');
      assert.deepEqual(vscode.probe.notifications, []);
    } finally {
      dispose();
    }
  });
});
