// A board whose binary predates the `?chrome=` contract, and the one sentence
// this extension owes the human when it meets one.
//
// The first real run of this extension showed the board's own tab strip inside
// the panel, under the sidebar tree. Nothing here was wrong: the board was served
// by a binary built before `?chrome=` landed, and an unknown query parameter is
// silently ignored by every version of the shell — so the extension asked, the
// board did not understand, and neither side said anything. The human found it by
// looking.
//
// The stub here is a real HTTP server answering the way an old `aboard` answered:
// a current `/health`, a current document, and a shell with no chrome stamp. No
// aboard binary is needed, which is why this test is separate from
// `integration.test.ts` — the negative case belongs where it always runs.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, before, describe, it } from 'node:test';

// The resolver hook, as in integration.test.ts: `vscode` is the host's, so point
// it at the stub before anything requires the two files that import it.
const nodeModule = require('node:module') as { _resolveFilename: (...args: unknown[]) => string };
const stubPath = require.resolve('./vscode-stub');
const originalResolve = nodeModule._resolveFilename;
nodeModule._resolveFilename = function (this: unknown, request: unknown, ...rest: unknown[]): string {
  if (request === 'vscode') {
    return stubPath;
  }
  return originalResolve.apply(this, [request, ...rest]);
};

const repoRoot = path.join(__dirname, '..', '..');
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** The shell as it was before `?chrome=` landed: a tab strip and no stamp. */
const OLD_SHELL = `<!doctype html><html><body>
<div class="board-head"><div class="tabstrip"><div class="tabs"></div><button id="add-tab">+</button></div></div>
<script type="module" src="/aboard.js"></script>
</body></html>`;

/** And as it is now. The stamp is a classic script at the top of body. */
const NEW_SHELL = `<!doctype html><html><body>
<script>
  var want = new URLSearchParams(location.search).get('chrome');
  document.body.dataset.chrome = ['full', 'notabs', 'none'].indexOf(want) >= 0 ? want : 'full';
</script>
<div class="board-head"><div class="tabstrip"><div class="tabs"></div></div></div>
</body></html>`;

let projectDir = '';
let server: http.Server;
let port = 0;
let shell = OLD_SHELL;
/** How long `GET /` takes to answer. Non-zero widens the in-flight window. */
let shellDelay = 0;
/** Every `GET /` this stub has served, so a test can count probes as well as warnings. */
let shellHits = 0;
const streams = new Set<http.ServerResponse>();

const DOC = {
  version: 3,
  rev: 4,
  updatedAt: '2026-08-26T13:33:30Z',
  nextId: 40,
  tabs: [
    { id: 'ab1', name: 'Roadmap', type: 'dag', touched: { by: 'agent-1', at: '2026-08-26T13:33:30Z', note: 'new tab' } },
    { id: 'ab6', name: 'Sprint Board', type: 'kanban' },
  ],
};

before(async () => {
  projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aboard-vscode-old-')));
  server = http.createServer((req, res) => {
    const url = (req.url ?? '').split('?')[0];
    const json = (body: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url === '/health') {
      return json({ app: 'aboard', project: projectDir, port, version: 'f67e682', built: '2026-08-26T00:20:00Z' });
    }
    if (url === '/aboard.json') {
      return json(DOC);
    }
    if (url === '/capabilities') {
      return json({ app: 'aboard', schema: 3, capsHash: 'old', types: [{ type: 'dag', label: 'Plan' }] });
    }
    if (url === '/waiters') {
      return json({ waiting: 0 });
    }
    if (url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write('retry: 1000\n\n');
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return undefined;
    }
    if (url === '/' || url === '/aboard.html') {
      shellHits += 1;
      const answer = () => {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(shell);
      };
      if (shellDelay > 0) {
        setTimeout(answer, shellDelay);
        return undefined;
      }
      answer();
      return undefined;
    }
    res.writeHead(404);
    return res.end('no');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
  const runDir = path.join(projectDir, '.aboard', 'run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'instance.json'),
    JSON.stringify({ app: 'aboard', project: projectDir, port, version: 'f67e682' }),
  );
});

after(async () => {
  for (const stream of streams) {
    stream.end();
  }
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(projectDir, { recursive: true, force: true });
});

async function run(): Promise<{ vscode: typeof import('./vscode-stub'); dispose(): void }> {
  const vscode = require('./vscode-stub') as typeof import('./vscode-stub');
  const { activate } = require('../src/extension') as typeof import('../src/extension');
  vscode.probe.reset();
  shellHits = 0;
  vscode.workspace.workspaceFolders = [{ uri: { scheme: 'file', fsPath: projectDir } }];
  const subscriptions: Array<{ dispose(): void }> = [];
  activate({ subscriptions, extensionUri: vscode.Uri.file(repoRoot) } as unknown as Parameters<typeof activate>[0]);
  return {
    vscode,
    dispose() {
      for (const sub of subscriptions) {
        sub.dispose();
      }
      vscode.workspace.workspaceFolders = [];
    },
  };
}

describe('a board older than the ?chrome= contract', { timeout: 30_000 }, () => {
  it('says so once, and does not repeat itself on every write', async () => {
    shell = OLD_SHELL;
    const { vscode, dispose } = await run();
    try {
      await sleep(1500);
      const about = vscode.probe.notifications.filter((n) => /tab strip/.test(n.message));
      assert.equal(about.length, 1, `expected exactly one notification, got ${JSON.stringify(vscode.probe.notifications)}`);
      assert.equal(about[0]!.level, 'warning');
      assert.match(about[0]!.message, /predates the `\?chrome=` contract/);
      // It names the board and the binary, because a multi-root workspace can
      // have two and only one of them may be old.
      assert.match(about[0]!.message, /aboard f67e682/);
      // And the reason it is only a warning: nothing is broken, it is doubled.
      assert.match(about[0]!.message, /Everything works/);
      assert.ok(
        vscode.probe.log.some((line) => /does not understand \?chrome=/.test(line)),
        'the output channel should carry the same fact for later reading',
      );

      // An agent writing to the board must not re-raise it. The frame drives a
      // full reload, which is the path the probe sits on.
      for (const stream of streams) {
        stream.write('data: {"origin":"agent-1"}\n\n');
      }
      await sleep(1200);
      assert.equal(
        vscode.probe.notifications.filter((n) => /tab strip/.test(n.message)).length,
        1,
        'the notification fires once per board, not once per write',
      );

      // The tabs still render, dots and all: an old board is usable, not broken.
      const row = vscode.probe.rows.find((r) => r.description === 'ab1');
      assert.ok(row, 'the tree should still list the board’s tabs');
      assert.equal(path.basename(row.iconPath ?? ''), 'dot-change.svg');
    } finally {
      dispose();
    }
  });

  // The regression this file did NOT cover until 2026-08-26: the guard was set on
  // the far side of the probe's await, so any reload that started while the probe
  // was in flight passed it and started a probe of its own. With a shell that
  // answers instantly — which is what the test above uses — the window is too
  // narrow to hit. Widen it and the "once per board" contract breaks: three
  // notifications, measured, before the fix in Controller.checkChromeContract.
  it('still says it once when writes land while the probe is in flight', async () => {
    shell = OLD_SHELL;
    shellDelay = 600;
    const { vscode, dispose } = await run();
    try {
      // Two writes inside the 600ms the shell takes to answer the first probe.
      await sleep(250);
      for (const stream of streams) {
        stream.write('data: {"origin":"agent-1"}\n\n');
      }
      await sleep(200);
      for (const stream of streams) {
        stream.write('data: {"origin":"agent-2"}\n\n');
      }
      await sleep(2500);
      const about = vscode.probe.notifications.filter((n) => /tab strip/.test(n.message));
      assert.equal(
        about.length,
        1,
        `one warning per board, whatever the timing — got ${about.length}: ${JSON.stringify(vscode.probe.notifications)}`,
      );
      // And the probe itself: the shell is a whole page, so a probe per write is
      // a request storm as well as a duplicate notification.
      assert.equal(shellHits, 1, `the shell should be fetched once per board, not ${shellHits} times`);
    } finally {
      shellDelay = 0;
      dispose();
    }
  });

  it('says nothing at all about a board that understands it', async () => {
    shell = NEW_SHELL;
    const { vscode, dispose } = await run();
    try {
      await sleep(1500);
      assert.deepEqual(
        vscode.probe.notifications.filter((n) => /chrome|tab strip/.test(n.message)),
        [],
      );
    } finally {
      dispose();
    }
  });
});
