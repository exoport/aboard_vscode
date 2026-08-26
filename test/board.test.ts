// The client against a stub board. Not a mock of our own code: a real HTTP
// server that answers the way `pkg/aboard/server.go` answers, so the parts that
// can be wrong on the wire — the control fields, the 409 retry, the SSE frames —
// are wrong here first.

import * as assert from 'node:assert/strict';
import * as http from 'node:http';
import { afterEach, describe, it } from 'node:test';

import { Board, describeWriteFailure, shellSupportsChrome, type Doc, type Instance } from '../src/board';

interface Stub {
  server: http.Server;
  port: number;
  posts: Array<Record<string, unknown>>;
  doc: Doc;
  /** Bump the revision behind the client's back, exactly once, on the next POST. */
  raceOnce: boolean;
  /** Refuse every write, so the retry policy is observable. */
  alwaysConflict: boolean;
  /** How many SSE clients are attached right now. */
  readonly listeners: number;
  push(frame: string): void;
  pushRaw(bytes: Buffer): void;
  close(): Promise<void>;
}

const stubs: Stub[] = [];

async function startStub(over: Partial<Doc> = {}): Promise<Stub> {
  const clients = new Set<http.ServerResponse>();
  const state: Stub = {
    server: undefined as unknown as http.Server,
    port: 0,
    posts: [],
    doc: { version: 3, rev: 41, updatedAt: '2026-08-25T11:03:09Z', nextId: 200, tabs: [{ id: 'bb1', name: 'One', type: 'dag' }], ...over },
    raceOnce: false,
    alwaysConflict: false,
    get listeners() {
      return clients.size;
    },
    /** Write raw bytes — for a frame split in the middle of a character. */
    pushRaw(bytes: Buffer) {
      for (const res of clients) {
        res.write(bytes);
      }
    },
    push(frame) {
      for (const res of clients) {
        res.write(`data: ${frame}\n\n`);
      }
    },
    async close() {
      for (const res of clients) {
        res.end();
      }
      await new Promise<void>((resolve) => state.server.close(() => resolve()));
    },
  };

  state.server = http.createServer((req, res) => {
    const url = req.url ?? '';
    if (req.method === 'GET' && url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ app: 'aboard', project: '/p', port: state.port, version: '0.9.0' }));
      return;
    }
    if (req.method === 'GET' && url === '/aboard.json') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(state.doc));
      return;
    }
    if (req.method === 'GET' && url === '/capabilities') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ app: 'aboard', schema: 3, types: [{ type: 'dag', label: 'Plan' }] }));
      return;
    }
    if (req.method === 'GET' && url === '/waiters') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ waiting: 1, waiters: [{ by: 'agent-1' }], lastPoke: null }));
      return;
    }
    if (req.method === 'POST' && url === '/poke') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, released: 2 }));
      return;
    }
    if (req.method === 'GET' && url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write('retry: 1000\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.method === 'POST' && url === '/aboard.json') {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
        state.posts.push(body);
        if (state.raceOnce || state.alwaysConflict) {
          state.raceOnce = false;
          state.doc.rev = (state.doc.rev ?? 0) + 1;
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              error: 'conflict',
              live: String(state.doc.rev),
              base: String(body.__base),
              reason: `your base is rev ${String(body.__base)} and the board is at rev ${state.doc.rev} — re-read the document, redo the edit, apply again`,
            }),
          );
          return;
        }
        if (String(body.__base) !== String(state.doc.rev)) {
          res.writeHead(409, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'conflict', live: String(state.doc.rev), base: String(body.__base), reason: 'stale base' }));
          return;
        }
        const next = { ...body };
        delete next.__base;
        delete next.__by;
        delete next.__origin;
        state.doc = { ...(next as unknown as Doc), rev: (state.doc.rev ?? 0) + 1 };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rev: state.doc.rev, updatedAt: 'now' }));
      });
      return;
    }
    res.writeHead(404).end('not found');
  });

  await new Promise<void>((resolve) => state.server.listen(0, '127.0.0.1', resolve));
  state.port = (state.server.address() as { port: number }).port;
  stubs.push(state);
  return state;
}

function boardFor(stub: Stub, over: Partial<Instance> = {}): Board {
  return new Board('/p', '/p/.aboard/run/instance.json', { app: 'aboard', project: '/p', port: stub.port, ...over });
}

afterEach(async () => {
  await Promise.all(stubs.splice(0).map((s) => s.close()));
});

describe('reads', () => {
  it('reads the document, the manifest, the waiters and health', async () => {
    const stub = await startStub();
    const board = boardFor(stub);
    assert.equal((await board.state()).tabs[0]!.id, 'bb1');
    assert.equal((await board.capabilities()).schema, 3);
    assert.equal((await board.waiters()).waiting, 1);
    assert.equal((await board.health()).app, 'aboard');
    assert.equal(await board.poke(), 2);
  });

  it('builds the URL the panel frames from the loopback origin and the base path', () => {
    const board = new Board('/p', '/f', { app: 'aboard', project: '/p', port: 1234, base: '/prefix' });
    assert.equal(board.boardUrl, 'http://127.0.0.1:1234/prefix/');
  });

  it('names a board by its folder, and by its name when it has one', () => {
    assert.equal(new Board('/home/dev/proj', '/f', { app: 'aboard', project: '/home/dev/proj', port: 1 }).title, 'proj');
    assert.equal(
      new Board('/home/dev/proj', '/f', { app: 'aboard', project: '/home/dev/proj', port: 1, name: 'review' }).title,
      'proj · review',
    );
  });
});

describe('write', () => {
  it('sends the rev as __base, and says who it is', async () => {
    const stub = await startStub();
    const board = boardFor(stub);
    const result = await board.write((doc) => {
      doc.tabs[0]!.name = 'Renamed';
    });
    assert.equal(result.rev, 42);
    const post = stub.posts[0]!;
    // The token is the REVISION. `updatedAt` was the token on the spike, and a
    // millisecond clock is not a token: two writes inside one ms share a string.
    assert.equal(post.__base, 41);
    // Absent __by is "unknown", which has agent powers only — dismissing a
    // marker would then be a silent no-op with a 200.
    assert.equal(post.__by, 'human');
    assert.equal(post.__origin, 'vscode');
    assert.equal(stub.doc.tabs[0]!.name, 'Renamed');
  });

  it('re-reads and redoes the edit after a 409, exactly once', async () => {
    const stub = await startStub();
    stub.raceOnce = true;
    const board = boardFor(stub);
    const result = await board.write((doc) => {
      doc.tabs.push({ id: 'bb2', name: 'Two', type: 'dag' });
    });
    assert.equal(stub.posts.length, 2);
    // The retry is built on the document that is actually there, not a replay of
    // the stale one — which is the whole reason `write` takes an edit callback.
    assert.equal(stub.posts[1]!.__base, 42);
    assert.equal(result.rev, 43);
    assert.equal(stub.doc.tabs.length, 2);
  });

  it('gives up after the second conflict rather than looping against a busy board', async () => {
    const stub = await startStub();
    stub.alwaysConflict = true;
    const board = boardFor(stub);
    await assert.rejects(
      board.write((doc) => {
        doc.tabs[0]!.name = 'x';
      }),
      (err: Error) => {
        assert.match(err.message, /board changed while you were editing/);
        assert.match(err.message, /Nothing was overwritten/);
        return true;
      },
    );
    // Two attempts, not a retry loop: the human is standing at the keyboard and
    // a real disagreement is worth telling them about.
    assert.equal(stub.posts.length, 2);
  });

  it('does not post at all when the edit has nothing to do', async () => {
    const stub = await startStub();
    const board = boardFor(stub);
    const result = await board.write(() => false);
    assert.equal(result.skipped, true);
    assert.equal(stub.posts.length, 0);
  });

  it('falls back to updatedAt on a document that predates the rev counter', async () => {
    const stub = await startStub();
    delete stub.doc.rev;
    const board = boardFor(stub);
    await board.write((doc) => {
      doc.tabs[0]!.name = 'legacy';
    }).catch(() => undefined);
    assert.equal(stub.posts[0]!.__base, '2026-08-25T11:03:09Z');
  });
});

describe('describeWriteFailure', () => {
  it('turns a 409 into a sentence that says nothing was lost', () => {
    const message = describeWriteFailure({
      status: 409,
      body: JSON.stringify({ error: 'conflict', reason: 'your base is rev 41 and the board is at rev 43' }),
    });
    assert.match(message, /rev 41/);
    assert.match(message, /Nothing was overwritten/);
  });

  it('does not invent detail it was not given', () => {
    assert.match(describeWriteFailure({ status: 500, body: 'boom' }), /HTTP 500/);
  });
});

describe('events', () => {
  it('refreshes on a state frame, counts waiters, and ignores the ui frame', async () => {
    const stub = await startStub();
    const board = boardFor(stub);
    const states: Array<string | null> = [];
    const waiters: number[] = [];
    let connected = false;
    const sub = board.events({
      onState: (origin) => states.push(origin),
      onWaiters: (n) => waiters.push(n),
      onStatus: (up) => {
        connected = up;
      },
    });
    try {
      await waitFor(() => connected && stub.listeners > 0);
      // The board sends this one FIRST on every connect. Acting on it would
      // refresh a tree for a reason that has nothing to do with the tree.
      stub.push('{"ui":{"sig":"a"}}');
      stub.push('{"origin":"cli"}');
      stub.push('{"waiters":3}');
      await waitFor(() => states.length === 1 && waiters.length === 1);
      await delay(50);
      assert.deepEqual(states, ['cli']);
      assert.deepEqual(waiters, [3]);
    } finally {
      sub.dispose();
    }
  });

  it('reassembles a frame whose multi-byte character is split across two chunks', async () => {
    // The stream reads Buffers (see the setEncoding note in board.ts) and
    // decodes them itself, so a two-byte character cut by a TCP boundary must
    // still come out as one character and not as two replacement marks.
    const stub = await startStub();
    const board = boardFor(stub);
    const states: Array<string | null> = [];
    let connected = false;
    const sub = board.events({ onState: (origin) => states.push(origin), onStatus: (up) => { connected = up; } });
    try {
      await waitFor(() => connected && stub.listeners > 0);
      const bytes = Buffer.from('data: {"origin":"agent-ñ"}\n\n', 'utf8');
      const cut = bytes.indexOf(Buffer.from('ñ', 'utf8')) + 1; // between the two bytes of ñ
      stub.pushRaw(bytes.subarray(0, cut));
      await delay(30);
      stub.pushRaw(bytes.subarray(cut));
      await waitFor(() => states.length === 1);
      assert.deepEqual(states, ['agent-ñ']);
    } finally {
      sub.dispose();
    }
  });
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) {
      throw new Error('timed out waiting for the condition');
    }
    await delay(20);
  }
}

describe('a request that is cut off', () => {
  // Regression. Every path out of httpRequest must settle the promise: a
  // pending one stops `discover()` forever, because its re-entrancy flag is
  // held across the await and nothing ever clears it. There is no error
  // anywhere — the sidebar simply stops updating for the life of the window.
  // The timeout is the assertion as much as the rejects() is: before the fix
  // this test did not fail, it HUNG — which is precisely the production
  // symptom, and a runner that never returns is a worse regression signal than
  // a red line.
  it('rejects when the board dies mid-answer instead of hanging forever', { timeout: 5000 }, async () => {
    const server = http.createServer((_req, res) => {
      // A promised length, then nothing: exactly what a killed server does.
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': '999' });
      res.write('{"tabs":');
      setTimeout(() => res.socket?.destroy(), 20);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const board = new Board('/p', '/f', { app: 'aboard', project: '/p', port });
    try {
      await assert.rejects(board.state(), (err: Error) => {
        assert.match(err.message, /aboard\.json/);
        return true;
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('still resolves an ordinary answer exactly once', async () => {
    const stub = await startStub();
    const board = boardFor(stub);
    assert.equal((await board.state()).rev, 41);
    assert.equal((await board.state()).rev, 41);
  });
});

describe('the ?chrome= probe', () => {
  // There is no field in `/capabilities` that says whether the shell understands
  // `?chrome=` — the manifest carries app, schema, capsHash, types, commands,
  // rootFlags and routes, and none of them describes the shell's query
  // parameters. `capsHash` moves whenever any spec moves, so it can say
  // "different" but never "older", and `/health.version` is `git describe`, which
  // on an untagged tree is a commit hash and does not order either. So the probe
  // reads the shell and looks for the line that IS the feature.

  it('recognises a shell that stamps the chrome attribute', () => {
    const modern = `<body>\n<script>document.body.dataset.chrome = ['full','notabs','none'].indexOf(want) >= 0 ? want : 'full';</script>`;
    assert.equal(shellSupportsChrome(modern), true);
  });

  it('recognises the attribute spelled as a selector, in case the stamp moves into CSS', () => {
    assert.equal(shellSupportsChrome('<style>body[data-chrome="notabs"] .tabs{display:none}</style>'), true);
  });

  it('says no to the shell that shipped before it landed', () => {
    // The board the human framed on 2026-08-26 was served by a binary built
    // before `?chrome=`, and an unknown query parameter is not an error, so it
    // drew its own tab strip inside the panel and said nothing.
    const old = `<body>\n<script type="module" src="/aboard.js"></script>\n<div class="tabstrip"><div class="tabs"></div></div>`;
    assert.equal(shellSupportsChrome(old), false);
  });
});

describe('the event stream when the board is not really there', { timeout: 30_000 }, () => {
  // A port that accepts a connection and drops it is not a hypothetical: a board
  // crash-looping under a supervisor, a proxy closing an idle stream, or another
  // process that grabbed the derived port all look exactly like this. The backoff
  // used to be reset the moment the response HEADERS arrived, so every such cycle
  // counted as a success and the delay never left its 1s floor — an open socket
  // and an output-channel line every second, for the life of the window, from the
  // one mechanism whose stated job is not to do that.
  it('backs off instead of reconnecting at the floor forever', async () => {
    let connects = 0;
    const server = http.createServer((req, res) => {
      if ((req.url ?? '').startsWith('/events')) {
        connects += 1;
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.write('retry: 1000\n\n');
        res.write('data: {"origin":"someone"}\n\n');
        setTimeout(() => res.socket?.destroy(), 60);
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;
    const board = new Board('/tmp/nowhere', '/tmp/nowhere/instance.json', {
      app: 'aboard',
      project: '/tmp/nowhere',
      port,
    } as Instance);

    const frames: Array<string | null> = [];
    const sub = board.events({ onState: (origin) => frames.push(origin) });
    await new Promise((resolve) => setTimeout(resolve, 6000));
    sub.dispose();
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // It does keep trying — a board that comes back must be picked up.
    assert.ok(connects >= 2, `expected at least one reconnect, got ${connects} connections`);
    // But at 1s, 2s, 4s, … : three attempts fit in six seconds, not six.
    assert.ok(connects <= 4, `expected the delay to grow; got ${connects} connections in 6s`);
    // And each connection is one stream, not two: a socket that dies can report
    // itself on both the response and the request, and both used to schedule a
    // reconnect of their own.
    assert.equal(frames.length, connects, `each connection should deliver its frame once, got ${frames.length}`);
  });
});
