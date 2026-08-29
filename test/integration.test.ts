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
//      — the two writes in this repo that had never touched a server;
//   6. a REAL `aboard wait` parked on the board, the nudge button lighting because of it,
//      and the poke from the sidebar releasing it — exit 0 from the CLI.
//
// (6) is the defect the human found on 2026-08-26: "the poke in the terminal
// exited ok, the notification icon was not lit". The release half was already
// true and is re-proved here; the indicator half is the new claim, and it needs
// a genuinely blocked process because `/waiters` counts open connections. A stub
// that merely answers `{"waiting": 1}` cannot exit 0 at the end.
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
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';

import type { Board, Candidate, Doc } from '../src/board';
import { BOARD_TOKENS } from '../src/theme';
import type { RenderedRow } from './vscode-stub';

/* ------------------------------------------------------------ the binary */

/**
 * Where the `aboard` binary is, in the order worth trying.
 *
 * A judgement call worth stating: when it is missing, this file SKIPS rather than
 * fails. The binary lives in a different repository that a clone of this one does
 * not carry, and a suite that cannot pass without a second checkout is a suite
 * people stop running. The skip is loud — it prints what it looked for and how to
 * get it — because a silent skip is worse than a failure.
 *
 * The default used to be one absolute path under one person's home directory,
 * which worked on exactly one machine and told every other reader that this suite
 * was not for them. Now: an explicit ABOARD_BIN, then whatever `aboard` is on
 * PATH (a `go install`, which is what CI does), then a sibling checkout, which is
 * the layout a contributor working on both repositories already has.
 */
const executable = (candidate: string): boolean => {
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
};

// An explicit ABOARD_BIN is used ALONE. Falling back from a path somebody set on
// purpose would test a different binary than the one they named and say nothing
// about it — the same silent-substitution problem that makes a skipped gate read
// as a pass.
const CANDIDATES = process.env.ABOARD_BIN
  ? [process.env.ABOARD_BIN]
  : [
      ...(process.env.PATH ?? '').split(path.delimiter).filter(Boolean).map((d) => path.join(d, 'aboard')),
      path.resolve(__dirname, '..', '..', '..', 'aboard', 'aboard'),
    ];

const found = CANDIDATES.find(executable);
const ABOARD_BIN = found ?? CANDIDATES[0] ?? 'aboard';
const haveBinary = found !== undefined;

const skip = haveBinary
  ? false
  : 'no `aboard` binary found — put one on PATH (`go install github.com/exoport/aboard/cmd/aboard@latest`), '
    + 'point ABOARD_BIN at one, or check out the aboard repo beside this one and `make build` there';

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
  const id = `ab${next}`;
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

  it('agrees with the binary about the board’s 21 token names', () => {
    // `src/theme.ts` carries the token list so the mapper can be unit-tested
    // without a board, and so the extension can refuse to send a name the board
    // does not have. That is a COPY of something the aboard repo owns — the same
    // shape as the two hex values in `src/tokens.ts` — and the same rule applies:
    // the copy is checked against its source rather than trusted, because a
    // token the board dropped or renamed arrives as a console warning on the
    // board's own console, which nobody working in VS Code is looking at.
    //
    // `capabilities` needs no server, so this asks the binary directly.
    const raw = execFileSync(ABOARD_BIN, ['capabilities', '--format', 'json'], { encoding: 'utf8' });
    const declared = (JSON.parse(raw) as { theme: { tokens: string[] } }).theme.tokens;
    assert.deepEqual([...BOARD_TOKENS].sort(), [...declared].sort());
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
        const tabs = vscode.probe.rows.filter((r: RenderedRow) => /^ab\d+$/.test(r.description ?? ''));
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

  it('lights the nudge button for a session really parked on `aboard wait`, and releases it', async () => {
    const vscode = require('./vscode-stub') as typeof import('./vscode-stub');
    const { activate } = require('../src/extension') as typeof import('../src/extension');

    vscode.probe.reset();
    vscode.workspace.workspaceFolders = [{ uri: { scheme: 'file', fsPath: projectDir } }];
    const subscriptions: Array<{ dispose(): void }> = [];
    activate({ subscriptions, extensionUri: vscode.Uri.file(repoRoot) } as unknown as Parameters<typeof activate>[0]);

    let waiter: ChildProcess | undefined;
    try {
      await until('the tree to list the board’s tabs', 20_000, () =>
        vscode.probe.rows.some((r: RenderedRow) => /^ab\d+$/.test(r.description ?? '')) || undefined,
      );
      // Nobody waiting yet, and the extension says so rather than leaving the
      // key unset — a `when` clause cannot tell those apart, but a regression
      // that stops setting it at all can only be caught here.
      assert.equal(vscode.probe.contexts.get('aboard.waiting'), false);

      // A real session parks. `--timeout` is short enough that a failure here
      // cannot leave a process blocked for ten minutes.
      waiter = spawn(
        ABOARD_BIN,
        ['wait', '--for', 'poke', '--by', 'agent-integration', '--note', 'the nudge test', '--timeout', '60s'],
        { cwd: projectDir, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      const exited = new Promise<number | null>((resolve) => waiter!.on('exit', (code) => resolve(code)));

      // The `waiters` frame, or the /waiters read on the next reload — whichever
      // gets there first. Both are supposed to work; this asserts the outcome.
      await until('the button to light', 20_000, () =>
        vscode.probe.contexts.get('aboard.waiting') === true || undefined,
      );
      assert.match(vscode.probe.status?.text ?? '', /nudge 1/);

      // The human presses it.
      const notify = vscode.probe.commands.get('aboard.nudge');
      assert.ok(notify, 'aboard.nudge is not registered');
      await notify();

      const code = await Promise.race([exited, sleep(10_000).then(() => 'still blocked' as const)]);
      assert.equal(code, 0, `the parked session was not released (aboard wait exited ${String(code)})`);
      waiter = undefined;

      await until('the button to go out', 10_000, () =>
        vscode.probe.contexts.get('aboard.waiting') === false || undefined,
      );
    } finally {
      if (waiter?.pid) {
        try {
          process.kill(waiter.pid, 'SIGTERM');
        } catch {
          // Already gone.
        }
      }
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

  // The bug the human hit on 2026-08-29: the board was gone and the sidebar
  // still believed in it, so the "Start the Board" button — gated on
  // `!aboard.hasBoard` in BOTH viewsWelcome clauses — was simply absent, and
  // the tree kept a dead board's tabs. Reloading the window was the only way
  // out, which is not a fix.
  //
  // Why only sometimes, which is why it took a while to see: aboard DOES remove
  // `instance.json` when it shuts down properly — on a clean return and on
  // Ctrl-C/SIGTERM alike (server.go, "Remove the instance file on Ctrl-C too").
  // That path was always fine: the file disappears, the watcher fires
  // onDidDelete, discovery re-runs, the button comes back.
  //
  // The broken path is a board that never gets to run that code — SIGKILL, a
  // crash, an OOM, a laptop suspended into oblivion, a parent terminal taken
  // out from under it. The record survives verbatim, no filesystem event
  // exists to notice, and the only remaining signal is the event stream
  // dropping — which was logged and thrown away.
  //
  // So this test SIGKILLs. Using SIGTERM here would delete the record and
  // silently exercise the path that already worked.
  //
  // This kills a REAL server, so it must stay LAST in this describe: every test
  // above it needs the board alive. `stopBoard` tolerates an already-dead one.
  it('drops a board that dies, so the Start button can come back', async () => {
    const vscode = require('./vscode-stub') as typeof import('./vscode-stub');
    const { activate } = require('../src/extension') as typeof import('../src/extension');

    vscode.probe.reset();
    vscode.workspace.workspaceFolders = [{ uri: { scheme: 'file', fsPath: projectDir } }];

    const subscriptions: Array<{ dispose(): void }> = [];
    activate({
      subscriptions,
      extensionUri: vscode.Uri.file(repoRoot),
    } as unknown as Parameters<typeof activate>[0]);

    try {
      await until('the live board to be discovered', 20_000, () =>
        vscode.probe.contexts.get('aboard.hasBoard') === true || undefined,
      );

      // SIGKILL, deliberately — see above. The process gets no chance to clean
      // up, so the instance record stays on disk exactly as written, which is
      // the whole premise.
      assert.ok(server?.pid, 'no server to kill');
      const exited = new Promise<void>((resolve) => server?.on('exit', () => resolve()));
      process.kill(server.pid, 'SIGKILL');
      await Promise.race([exited, sleep(5000)]);
      assert.ok(
        fs.existsSync(path.join(projectDir, '.aboard', 'run', 'instance.json')),
        'the premise is gone: a dead board now cleans up its own record, so this test proves nothing',
      );

      // No watcher event can fire from here. Only the dropped stream can, and
      // recovery is on a throttle, so allow it comfortably.
      await until('hasBoard to go false after the board died', 25_000, () =>
        vscode.probe.contexts.get('aboard.hasBoard') === false || undefined,
      );
      assert.equal(
        vscode.probe.contexts.get('aboard.hasProject'),
        true,
        'the project is still there — only the board went away',
      );
      assert.equal(
        vscode.probe.rows.filter((r: RenderedRow) => /^ab\d+$/.test(r.description ?? '')).length,
        0,
        'a dead board left its tabs in the tree, which also suppresses the welcome view',
      );
    } finally {
      for (const s of subscriptions) {
        s.dispose();
      }
    }
  });
});
