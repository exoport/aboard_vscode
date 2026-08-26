// The one test in this repo that talks to a real board.
//
// Everything else here is pure and fast. This one spawns the actual `aboard`
// binary on a throwaway project and drives the extension against it, because the
// defects the first real run found were not in any single function — they were in
// the seam between this repo, the board, and the host. A seam needs both sides.
//
// It covers, in one pass:
//
//   1. discovery → `/health` → `state()` → `events()` against a live server;
//   2. a write by a SECOND actor setting `touched`, the `origin` frame arriving,
//      and the refetched document carrying the mark;
//   3. the whole vscode-side chain — `activate()`, the SSE frame, the debounce,
//      `onDidChangeTreeData`, `getTreeItem` — ending in a row whose `iconPath`
//      names a file that exists AND parses;
//   4. the `?chrome=` probe answering `true` against a current binary;
//   5. `approveRemoval` and `denyRemoval` answered against a REAL removal request
//      — the two writes in this repo that had never touched a server.
//
// (5) is here because the board is the half that enforces it. `approveRemoval`
// filters a tab out of a document, and an agent doing that gets the tab RESTORED
// with a `pendingRemoval` instead (guarantee 1); the same edit from a human is a
// deletion. Nothing in this repo can tell those two apart — the difference is a
// `__by` the server reads — so a unit test asserting the edit function does the
// right thing to a JSON object proves nothing about what the board does with it.
//
// (3) is the one that matters most. The missing dots on 2026-08-26 looked exactly
// like a tree that never refreshed, and this is the test that says it does — so
// the next time a dot is missing, nobody re-derives the same wrong suspect.
//
// **The board it spawns is NOT the human's.** A fresh `mkdtemp` project every
// run: the port is derived from the project path, so a temp directory cannot
// collide with a board somebody is using, and the server is killed by pid in
// `after`.

import * as assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Board, Candidate, Doc } from '../src/board';
import type { RenderedRow } from './vscode-stub';

/* ------------------------------------------------------------ the binary */

/**
 * Where the `aboard` binary is.
 *
 * A judgement call worth stating: when it is missing, this file SKIPS rather than
 * fails. The binary lives in a sibling repository that a clone of this one does
 * not carry, and a suite that cannot pass without a second checkout is a suite
 * people stop running. The skip is loud — it prints the path it looked at and how
 * to build it — because a silent skip is worse than a failure.
 */
const ABOARD_BIN = process.env.ABOARD_BIN ?? '/home/diegos/_dev/exoport/aboard/aboard';
const haveBinary = (() => {
  try {
    fs.accessSync(ABOARD_BIN, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
})();
const skip = haveBinary
  ? false
  : `no aboard binary at ${ABOARD_BIN} — build it with \`make build\` in the aboard repo, or set ABOARD_BIN`;

if (!haveBinary) {
  console.warn(`[integration] SKIPPED: ${skip}`);
}

/* ------------------------------------------------- the vscode module hook */

// `src/extension.ts` and `src/tree.ts` are the only files that import `vscode`,
// and the host provides it. Point the resolver at the stub BEFORE anything
// requires them — which is why they are pulled in with `require()` inside the
// test rather than with a top-level `import`, whose require would be hoisted
// above this.
const nodeModule = require('node:module') as { _resolveFilename: (...args: unknown[]) => string };
const stubPath = require.resolve('./vscode-stub');
const originalResolve = nodeModule._resolveFilename;
nodeModule._resolveFilename = function (this: unknown, request: unknown, ...rest: unknown[]): string {
  if (request === 'vscode') {
    return stubPath;
  }
  return originalResolve.apply(this, [request, ...rest]);
};

/* ------------------------------------------------------------- utilities */

const repoRoot = path.join(__dirname, '..', '..');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(what: string, ms: number, fn: () => T | undefined | Promise<T | undefined>): Promise<T> {
  const deadline = Date.now() + ms;
  let last: unknown;
  for (;;) {
    try {
      const value = await fn();
      if (value !== undefined && value !== false) {
        return value;
      }
    } catch (err) {
      last = err;
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${ms}ms waiting for ${what}${last ? `: ${String(last)}` : ''}`);
    }
    await sleep(100);
  }
}

let projectDir = '';
let server: ChildProcess | undefined;
let serverLog = '';

async function startBoard(): Promise<void> {
  projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aboard-vscode-it-')));
  const init = spawn(ABOARD_BIN, ['init', '--example', '--gitignore'], { cwd: projectDir });
  await new Promise<void>((resolve, reject) => {
    init.on('error', reject);
    init.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`aboard init exited ${code}`))));
  });
  server = spawn(ABOARD_BIN, ['serve'], { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout?.on('data', (c: Buffer) => (serverLog += c.toString()));
  server.stderr?.on('data', (c: Buffer) => (serverLog += c.toString()));
  try {
    await until('the instance record', 15_000, () =>
      fs.existsSync(path.join(projectDir, '.aboard', 'run', 'instance.json')) || undefined,
    );
  } catch (err) {
    // Whatever the server printed is the only explanation there is, and losing
    // it turns "the board never came up" into an unfixable sentence.
    throw new Error(`${String(err)}\n--- aboard serve said ---\n${serverLog}`);
  }
}

async function stopBoard(): Promise<void> {
  if (server?.pid) {
    // By pid, and waited for: a board left running would hold a port and a temp
    // directory for the life of the machine.
    const exited = new Promise<void>((resolve) => server?.on('exit', () => resolve()));
    try {
      process.kill(server.pid, 'SIGTERM');
    } catch {
      // Already gone.
    }
    await Promise.race([exited, sleep(5000)]);
  }
  if (projectDir) {
    fs.rmSync(projectDir, { recursive: true, force: true });
  }
}

/** Write as somebody who is not this extension, the way an agent's `apply` does. */
async function writeAsAgent(board: Board, edit: (doc: Doc) => void, by = 'agent-two'): Promise<void> {
  const { httpRequest } = require('../src/board') as typeof import('../src/board');
  const doc = await board.state();
  edit(doc);
  const payload = JSON.stringify({ ...doc, __base: doc.rev, __by: by, __origin: 'integration-test' });
  const res = await httpRequest(board.port, '/aboard.json', { method: 'POST', body: payload });
  assert.equal(res.status, 200, `the agent write was refused: ${res.status} ${res.body}`);
}

/**
 * Make a tab as an agent, then ask — as that agent — for it to be removed.
 *
 * The request is made by DELETING the tab from an agent's write, which is the
 * only way a real one is ever made: the server restores the tab and attaches a
 * `pendingRemoval`. Planting the field directly would test the extension against
 * a shape no board ever produces.
 */
async function requestRemovalOfAScratchTab(board: Board, name: string): Promise<string> {
  const doc = await board.state();
  const next = typeof doc.nextId === 'number' ? doc.nextId : 1;
  const id = `bb${next}`;
  await writeAsAgent(board, (d) => {
    d.nextId = next + 1;
    d.tabs.push({ id, name, type: 'notes', note: 'made by the integration test', state: { text: 'scratch\n' } });
  });

  await writeAsAgent(board, (d) => {
    d.tabs = d.tabs.filter((t) => t.id !== id);
  });

  const after = await board.state();
  const tab = after.tabs.find((t) => t.id === id);
  assert.ok(tab, `the board let an agent delete ${id} outright — guarantee 1 is gone`);
  assert.equal(typeof tab.pendingRemoval, 'object', `${id} carries no pendingRemoval`);
  return id;
}

describe('against a live aboard', { skip, timeout: 90_000 }, () => {
  before(startBoard);
  after(stopBoard);

  it('discovers the board, reads its document, and streams its changes', async () => {
    const { findAllInstances, verify } = require('../src/board') as typeof import('../src/board');
    const { dotFor } = require('../src/model') as typeof import('../src/model');

    const candidates: Candidate[] = findAllInstances([projectDir]);
    assert.equal(candidates.length, 1, 'exactly one instance record should be discoverable');
    assert.equal(candidates[0]!.projectRoot, projectDir);

    const { board, reason } = await until('the board to answer /health', 15_000, async () => {
      const v = await verify(candidates[0]!);
      return v.board ? v : undefined;
    });
    assert.ok(board, `discovery refused the board it just started: ${reason}`);

    const before = await board.state();
    assert.ok(before.tabs.length > 0, 'the --example board should have tabs');
    assert.equal(
      before.tabs.filter((t) => dotFor(t) === 'change').length,
      0,
      'a freshly initialised example board carries no change marks',
    );

    // The stream, and the frame the tree refresh hangs off.
    const frames: Array<string | null> = [];
    const sub = board.events({ onState: (origin) => frames.push(origin) });
    try {
      await sleep(500);
      const target = before.tabs[0]!.id;
      await writeAsAgent(board, (doc) => {
        const tab = doc.tabs.find((t) => t.id === target)!;
        tab.touched = { by: 'agent-two', at: new Date().toISOString(), note: 'integration test' };
      });

      const origin = await until('an origin frame', 10_000, () => (frames.length > 0 ? frames[0] : undefined));
      assert.equal(origin, 'integration-test', 'the change frame should name the writer');

      const after = await board.state();
      const tab = after.tabs.find((t) => t.id === target)!;
      assert.equal(typeof tab.touched, 'object', 'the refetched document should carry the mark');
      assert.equal(dotFor(tab), 'change', 'a touched tab is a change dot');
    } finally {
      sub.dispose();
    }
  });

  it('says the current binary understands ?chrome=', async () => {
    const { findAllInstances, verify } = require('../src/board') as typeof import('../src/board');
    const { board } = await verify(findAllInstances([projectDir])[0]!);
    assert.ok(board);
    assert.equal(await board.supportsChrome(), true);
  });

  it('puts a dot on the row, through the whole vscode chain', async () => {
    const vscode = require('./vscode-stub') as typeof import('./vscode-stub');
    const { activate } = require('../src/extension') as typeof import('../src/extension');
    const { findAllInstances, verify } = require('../src/board') as typeof import('../src/board');

    vscode.probe.reset();
    vscode.workspace.workspaceFolders = [{ uri: { scheme: 'file', fsPath: projectDir } }];

    const subscriptions: Array<{ dispose(): void }> = [];
    const context = {
      subscriptions,
      extensionUri: vscode.Uri.file(repoRoot),
    } as unknown as Parameters<typeof activate>[0];

    activate(context);
    try {
      // The first paint is the board's own row, drawn before its document has
      // arrived; wait for the tabs themselves.
      const rows = await until('the tree to list the board’s tabs', 20_000, () => {
        const tabs = vscode.probe.rows.filter((r: RenderedRow) => /^bb\d+$/.test(r.description ?? ''));
        return tabs.length > 0 ? tabs : undefined;
      });
      // One board: its tabs sit at the top level, no parent row.
      assert.ok(
        rows.every((r: RenderedRow) => !r.nested),
        'with one board the tabs are top-level rows',
      );
      // The earlier test in this file already marked one tab, so count rather
      // than assume a clean board — and pick a row that has no dot yet, so the
      // one that appears can only have come from the write below.
      const dottedBefore = rows.filter((r: RenderedRow) => r.iconPath).length;
      const target = rows.find((r: RenderedRow) => !r.iconPath)?.description;
      assert.ok(target, 'no undotted tab left to mark');

      const rendersBefore = vscode.probe.renders;
      const { board } = await verify(findAllInstances([projectDir])[0]!);
      assert.ok(board);
      await writeAsAgent(board, (d) => {
        const tab = d.tabs.find((t) => t.id === target)!;
        tab.touched = { by: 'agent-two', at: new Date().toISOString(), note: 'a change the human has not seen' };
      });

      // The SSE frame, the 120ms coalescing timer, the refetch, the tree event,
      // and getTreeItem — all of it, ending in an icon.
      const dotted = await until('the row to grow a dot', 20_000, () => {
        const row = vscode.probe.rows.find((r: RenderedRow) => r.description === target);
        return row?.iconPath ? row : undefined;
      });
      assert.ok(vscode.probe.renders > rendersBefore, 'the tree should have been asked to redraw');
      assert.equal(path.basename(dotted.iconPath!), 'dot-change.svg');
      assert.ok(fs.existsSync(dotted.iconPath!), `the icon path does not exist: ${dotted.iconPath}`);
      assert.match(dotted.contextValue!, /\btouched\b/);
      const dottedAfter = vscode.probe.rows.filter((r: RenderedRow) => r.iconPath).length;
      assert.equal(dottedAfter, dottedBefore + 1, 'exactly one row should have gained a dot');
      assert.deepEqual(vscode.probe.badge, {
        value: dottedAfter,
        tooltip: `${dottedAfter} tab${dottedAfter === 1 ? '' : 's'} changed`,
      });

      // And the negative: no notification about the board's age, because the
      // binary that just answered is a current one.
      assert.deepEqual(
        vscode.probe.notifications.filter((n) => /chrome/.test(n.message)),
        [],
      );
    } finally {
      for (const sub of subscriptions) {
        sub.dispose();
      }
      vscode.workspace.workspaceFolders = [];
    }
  });

  it('approves a removal request, and the tab is gone from the board', async () => {
    const { findAllInstances, verify } = require('../src/board') as typeof import('../src/board');
    const { approveRemoval } = require('../src/model') as typeof import('../src/model');

    const { board } = await verify(findAllInstances([projectDir])[0]!);
    assert.ok(board);
    const id = await requestRemovalOfAScratchTab(board, 'Approve me');

    const result = await board.write(approveRemoval(id));
    assert.equal(result.skipped, undefined, 'the edit reported nothing to do');

    // Read it back off the server rather than trusting the reply: the whole
    // point is that the SERVER accepted a deletion from a human, and the reply
    // is this repo's own description of what it sent.
    const after = await board.state();
    assert.equal(
      after.tabs.some((t) => t.id === id),
      false,
      `${id} is still on the board after the removal was approved`,
    );
  });

  it('denies a removal request, and the tab stays with the request cleared', async () => {
    const { findAllInstances, verify } = require('../src/board') as typeof import('../src/board');
    const { denyRemoval } = require('../src/model') as typeof import('../src/model');

    const { board } = await verify(findAllInstances([projectDir])[0]!);
    assert.ok(board);
    const id = await requestRemovalOfAScratchTab(board, 'Deny me');

    const result = await board.write(denyRemoval(id));
    assert.equal(result.skipped, undefined, 'the edit reported nothing to do');

    const after = await board.state();
    const tab = after.tabs.find((t) => t.id === id);
    assert.ok(tab, `denying the request removed ${id} anyway`);
    assert.equal(tab.name, 'Deny me', 'the tab came back as something else');
    assert.equal(
      tab.pendingRemoval === undefined || tab.pendingRemoval === null,
      true,
      'the removal request is still on the tab after being denied',
    );

    // Denying twice is a no-op the extension must not turn into a write: there
    // is no request left to clear, and `write` reports it rather than posting.
    const again = await board.write(denyRemoval(id));
    assert.equal(again.skipped, true, 'denying an already-answered request posted anyway');
  });
});
