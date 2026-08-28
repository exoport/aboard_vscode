// A board-shaped HTTP server, and `activate()` driven against it.
//
// **Not a test file** (no `.test.ts`), and not an aboard: it answers the six
// routes this extension reads and nothing else. It exists because the two
// defects the human found on 2026-08-26 — an indicator that never lit, and a "copy
// reference" that copied a link — both live in the adapter, between an HTTP
// answer and something on the screen. Neither is reachable from a pure unit test
// of `model.ts`, and neither needs a real binary: what they need is a board that
// says a specific thing at a specific moment (one waiter, then none) and a way
// to look at what the sidebar did about it.
//
// `test/integration.test.ts` still spawns the real thing — this harness makes
// the transitions cheap to provoke, not the server redundant. Where a claim is
// about what the SERVER does (a poke really releases a really-parked session),
// it belongs there and it is there.
//
// `test/oldboard.test.ts` keeps its own stub on purpose: it models a board that
// is OLD, with knobs (a slow shell, a probe counter) that only its question
// needs.

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';

// The resolver hook, as in the other adapter tests: `vscode` is the host's
// module, so point it at the stub BEFORE anything requires the files that import
// it. This runs when this module is loaded, which is before any test body.
const nodeModule = require('node:module') as { _resolveFilename: (...args: unknown[]) => string };
const stubPath = require.resolve('./vscode-stub');
const originalResolve = nodeModule._resolveFilename;
nodeModule._resolveFilename = function (this: unknown, request: unknown, ...rest: unknown[]): string {
  if (request === 'vscode') {
    return stubPath;
  }
  return originalResolve.apply(this, [request, ...rest]);
};

export const repoRoot = path.join(__dirname, '..', '..');
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Poll until `fn` returns something truthy, or give up with a sentence. */
export async function until<T>(what: string, ms: number, fn: () => T | undefined | false): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = fn();
    if (value !== undefined && value !== false) {
      return value;
    }
    if (Date.now() > deadline) {
      throw new Error(`timed out after ${ms}ms waiting for ${what}`);
    }
    await sleep(25);
  }
}

/** The shell, current enough that the `?chrome=` probe stays quiet. */
const SHELL = `<!doctype html><html><body>
<script>document.body.dataset.chrome = 'full';</script>
</body></html>`;

export const DOC = {
  version: 3,
  rev: 7,
  updatedAt: '2026-08-26T13:33:30Z',
  nextId: 40,
  tabs: [
    { id: 'ab1', name: 'Migration review', type: 'stack' },
    { id: 'ab71', name: 'Build queue', type: 'kanban' },
    { id: 'ab99', type: 'notes' },
  ],
};

export interface FakeBoard {
  projectDir: string;
  port: number;
  /** What `/waiters` answers. Set it, then `pushWaiters()` to announce it. */
  waiting: number;
  /** Every `POST /poke` this board received. */
  pokes: Array<Record<string, unknown>>;
  /** Announce the current count on the SSE stream, as the server does on register/release. */
  pushWaiters(): void;
  /** Announce a state change, which is what drives a reload. */
  pushOrigin(origin: string): void;
  /**
   * Cut every open SSE stream, as a restarted board does.
   *
   * The frames sent while a stream is down are GONE — the server fans out to the
   * channels it has open and drops the payload for anyone who is not there (see
   * `fanout` in pkg/aboard/server.go, which is a non-blocking send with a
   * `default:`). So a drop is the one way the waiter count can go stale with no
   * frame ever arriving to correct it.
   */
  dropStreams(): void;
  stop(): Promise<void>;
}

export async function startFakeBoard(): Promise<FakeBoard> {
  const projectDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aboard-vscode-fake-')));
  const streams = new Set<http.ServerResponse>();
  const board: FakeBoard = {
    projectDir,
    port: 0,
    waiting: 0,
    pokes: [],
    pushWaiters() {
      for (const stream of streams) {
        stream.write(`data: ${JSON.stringify({ waiters: board.waiting })}\n\n`);
      }
    },
    pushOrigin(origin: string) {
      for (const stream of streams) {
        stream.write(`data: ${JSON.stringify({ origin })}\n\n`);
      }
    },
    dropStreams() {
      for (const stream of streams) {
        stream.destroy();
      }
      streams.clear();
    },
    async stop() {
      for (const stream of streams) {
        stream.end();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(projectDir, { recursive: true, force: true });
    },
  };

  const server = http.createServer((req, res) => {
    const url = (req.url ?? '').split('?')[0];
    const json = (body: unknown) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (url === '/health') {
      return json({ app: 'aboard', project: projectDir, port: board.port, version: '93ba033' });
    }
    if (url === '/aboard.json') {
      return json(DOC);
    }
    if (url === '/capabilities') {
      return json({ app: 'aboard', schema: 3, capsHash: 'fake', types: [{ type: 'kanban', label: 'Kanban' }] });
    }
    if (url === '/waiters') {
      return json({ waiting: board.waiting, waiters: [], lastPoke: null });
    }
    if (url === '/poke' && req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        try {
          board.pokes.push(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>);
        } catch {
          board.pokes.push({});
        }
        const released = board.waiting;
        board.waiting = 0;
        json({ ok: true, released, at: new Date().toISOString(), by: 'human' });
        // The real server broadcasts the new count straight after releasing.
        board.pushWaiters();
      });
      return undefined;
    }
    if (url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
      res.write('retry: 1000\n\n');
      streams.add(res);
      req.on('close', () => streams.delete(res));
      return undefined;
    }
    if (url === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(SHELL);
    }
    res.writeHead(404);
    return res.end('no');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  board.port = (server.address() as { port: number }).port;
  const runDir = path.join(projectDir, '.aboard', 'run');
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'instance.json'),
    JSON.stringify({ app: 'aboard', project: projectDir, port: board.port, version: '93ba033' }),
  );
  return board;
}

export interface RunningExtension {
  vscode: typeof import('./vscode-stub');
  dispose(): void;
}

/** `activate()` against a fake board, with the probe reset. */
export function runExtension(projectDir: string): RunningExtension {
  const vscode = require('./vscode-stub') as typeof import('./vscode-stub');
  const { activate } = require('../src/extension') as typeof import('../src/extension');
  vscode.probe.reset();
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
