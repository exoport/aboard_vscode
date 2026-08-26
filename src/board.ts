// The HTTP client and the discovery walk. NOTHING in this file imports `vscode`:
// it is the half of the extension that can be tested with `node --test`, and the
// half that would keep working if this were ever a CLI. `tree.ts`, `panel.ts`
// and `extension.ts` are the adapter on top.
//
// The contract is `docs/reference/http-api.md` in the aboard repo, summarised in
// this repo's README. Two facts about it drive most of the code below:
//   * the compare-and-set token is `rev`, a counter — NOT `updatedAt`, which was
//     the token on the spike and is a millisecond clock two writes can share;
//   * an absent `__by` is "unknown", which has agent powers only, so every write
//     here says `__by: "human"` explicitly. Dismissing a marker or deleting a tab
//     is refused otherwise, silently, by carrying the old value forward.

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';

import { SseParser, classifyFrame, backoffDelay, type BoardFrame } from './sse';

/** The instance record, `.aboard/run/instance.json` and `GET /health` alike. */
export interface Instance {
  app: string;
  host?: string;
  argv0?: string;
  version?: string;
  built?: string;
  project: string;
  name?: string;
  port: number;
  url?: string;
  /**
   * The URL prefix the board is served under, "" for the server root.
   *
   * The server calls this `base` (see `Instance` in pkg/aboard/server.go, and
   * the `/health` row of http-api.md). `basePath` is read as a fallback because
   * that is the name the brief for this work expected the field to land under —
   * whichever one a future server sends, this reads it, and neither costs
   * anything when no `--base-path` was given, which is the common case.
   */
  base?: string;
  basePath?: string;
  state?: string;
  pid?: number;
  started?: string;
}

export interface TouchMark {
  by?: string;
  at?: string;
  note?: string;
}

export interface RemovalAsk {
  by?: string;
  at?: string;
  reason?: string;
}

export interface TabDoc {
  id: string;
  key?: string;
  name?: string;
  type: string;
  note?: string;
  stateFrom?: string;
  touched?: TouchMark | null;
  pendingRemoval?: RemovalAsk | null;
  seen?: Record<string, string>;
  [extra: string]: unknown;
}

export interface Doc {
  version?: number;
  rev?: number;
  updatedAt?: string;
  lastEditedBy?: string;
  nextId?: number;
  tabs: TabDoc[];
  [extra: string]: unknown;
}

/** `GET /capabilities`, only the parts a viewer has any business reading. */
export interface Capabilities {
  app?: string;
  schema?: number;
  capsHash?: string;
  types?: Array<{ type: string; label?: string; blurb?: string }>;
}

export interface Waiters {
  waiting: number;
  waiters?: Array<{ by?: string; note?: string; since?: string; for?: string }>;
  lastPoke?: { by?: string; at?: string; note?: string } | null;
}

/** An error worth showing the human verbatim; every message ends up in a notification. */
export class BoardError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'BoardError';
  }
}

/* ---------------------------------------------------------------- discovery */

export const ABOARD_DIR = '.aboard';

/** Every app identity a live board may answer with (plan-1 decision 6). */
export const KNOWN_APPS = ['aboard', 'ape-aboard'] as const;

export interface Candidate {
  /** The directory that contains `.aboard/` — resolved, so one project is one root. */
  projectRoot: string;
  instanceFile: string;
  instance: Instance;
}

/**
 * Mirror of `aboard`'s own `FindRoot`: walk up from `start` to the first
 * ancestor containing a `.aboard/` directory, then resolve symlinks.
 *
 * Both halves matter. Walking up is what lets a workspace opened on a
 * subdirectory find its project's board at all (plan-1 decision 5). Resolving is
 * what makes the `project` comparison below work: the server derives its port
 * from the RESOLVED root and reports that path from `/health`, so an unresolved
 * path would fail to match a board that is perfectly healthy.
 */
export function findProjectRoot(start: string, io: FsLike = realFs): string | undefined {
  let dir = path.resolve(start);
  for (;;) {
    if (io.isDirectory(path.join(dir, ABOARD_DIR))) {
      return io.realpath(dir) ?? dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

/** The filesystem calls discovery makes, injectable so the walk is testable. */
export interface FsLike {
  isDirectory(p: string): boolean;
  realpath(p: string): string | undefined;
  readDir(p: string): string[];
  readFile(p: string): string | undefined;
}

export const realFs: FsLike = {
  isDirectory(p) {
    try {
      return fs.statSync(p).isDirectory();
    } catch {
      return false;
    }
  },
  realpath(p) {
    try {
      return fs.realpathSync(p);
    } catch {
      return undefined;
    }
  },
  readDir(p) {
    try {
      return fs.readdirSync(p);
    } catch {
      return [];
    }
  },
  readFile(p) {
    try {
      return fs.readFileSync(p, 'utf8');
    } catch {
      return undefined;
    }
  },
};

/** `instance.json`, or `instance.<name>.json` for a named board. */
export function instanceFileName(file: string): string | undefined {
  // The name segment is greedy on purpose: a board name may contain dots
  // (`boardNameRe` in pkg/aboard/layout.go is `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`,
  // so `v1.2` is a legal name), and `[^.]+` here made `instance.v1.2.json`
  // invisible to discovery — a board that is running, answering and listed by
  // `aboard status`, with nothing in the tree and nothing in the log to say why.
  const m = /^instance(?:\.(.+))?\.json$/.exec(file);
  if (!m) {
    return undefined;
  }
  return m[1] ?? '';
}

/**
 * Every instance record reachable from `start`: walk up to the project root,
 * then read `.aboard/run/`.
 *
 * Named boards (`aboard serve --name review` writes `instance.review.json`) are
 * included rather than ignored. One project can genuinely be serving two, and a
 * tree that showed only the unnamed one would be lying about the same thing the
 * multi-root case makes obvious.
 */
export function findInstances(start: string, io: FsLike = realFs): Candidate[] {
  const projectRoot = findProjectRoot(start, io);
  if (!projectRoot) {
    return [];
  }
  const runDir = path.join(projectRoot, ABOARD_DIR, 'run');
  const out: Candidate[] = [];
  for (const entry of io.readDir(runDir).sort()) {
    if (instanceFileName(entry) === undefined) {
      continue;
    }
    const file = path.join(runDir, entry);
    const raw = io.readFile(file);
    if (raw === undefined) {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      // A half-written or hand-mangled record is not a board. Skipping it beats
      // failing discovery for every other folder in the workspace.
      continue;
    }
    const instance = parsed as Instance;
    if (typeof instance?.port !== 'number' || typeof instance?.project !== 'string') {
      continue;
    }
    out.push({ projectRoot, instanceFile: file, instance });
  }
  return out;
}

/** Discovery across a whole (possibly multi-root) workspace, de-duplicated. */
export function findAllInstances(folders: readonly string[], io: FsLike = realFs): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const folder of folders) {
    for (const candidate of findInstances(folder, io)) {
      if (seen.has(candidate.instanceFile)) {
        // Two folders of one multi-root workspace can sit under one project
        // root. That is one board, not two.
        continue;
      }
      seen.add(candidate.instanceFile);
      out.push(candidate);
    }
  }
  return out;
}

export type HealthVerdict = { ok: true } | { ok: false; reason: string };

/** Compare two absolute paths the way a filesystem would, modulo a trailing separator. */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => path.resolve(p).replace(/[\\/]+$/, '');
  return norm(a) === norm(b);
}

/**
 * Is this `/health` body a live board for THIS project?
 *
 * Two failure modes are indistinguishable without the `project` check, and both
 * are real: a stale instance file left by a server that died, and another
 * project's board answering on the port this one derived. Neither is exotic —
 * the port is a hash of the path, and a killed server does not always get to
 * clean up.
 */
export function acceptHealth(body: unknown, projectRoot: string): HealthVerdict {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, reason: 'the port answered, but not with an instance record' };
  }
  const health = body as Partial<Instance>;
  if (typeof health.app !== 'string' || !(KNOWN_APPS as readonly string[]).includes(health.app)) {
    return {
      ok: false,
      reason: `something other than a board is on this port (app: ${JSON.stringify(health.app ?? null)})`,
    };
  }
  if (typeof health.project !== 'string' || !samePath(health.project, projectRoot)) {
    return {
      ok: false,
      reason: `that port serves ${health.project ?? 'an unknown project'}, not ${projectRoot}`,
    };
  }
  return { ok: true };
}

/** "" or "/prefix" — never a trailing slash, always a leading one. */
export function normaliseBasePath(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value === '/') {
    return '';
  }
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** The base path a discovered instance is served under. */
export function basePathOf(instance: Instance): string {
  return normaliseBasePath(instance.base ?? instance.basePath ?? '');
}

/* --------------------------------------------------- the ?chrome= contract */

/**
 * Does the shell this board serves understand `?chrome=`?
 *
 * `?chrome=notabs` is what stops the board drawing its own tab strip inside the
 * panel, and it landed on the aboard side on 2026-08-26. An older binary ignores
 * the parameter — silently, because an unknown query parameter is not an error —
 * so the human gets two tab lists stacked on top of each other and nothing
 * anywhere says why. The first real run of this extension hit exactly that.
 *
 * **There is no field in `/capabilities` to test.** The manifest carries `app`,
 * `schema`, `capsHash`, `types`, `commands`, `rootFlags` and `routes`, and none
 * of them mentions the shell's query parameters; `capsHash` moved when `?chrome=`
 * landed but a hash is opaque, so a client cannot tell "different" from "older".
 * `/health.version` is `git describe --tags --always --dirty`, which on an
 * untagged tree is a commit hash — also unordered. So the honest probe is to ask
 * the shell itself: it stamps `document.body.dataset.chrome` in a classic script
 * at the top of `<body>`, and that line is the feature. Testing the feature beats
 * testing a proxy for it.
 *
 * Returns `undefined` when the shell could not be read at all — silence is right
 * there, because a false alarm about the board's age is worse than no alarm.
 */
export function shellSupportsChrome(html: string): boolean {
  return /dataset\s*\.\s*chrome\b/.test(html) || /\bdata-chrome\b/.test(html);
}

/* ------------------------------------------------------------------- client */

export interface HttpResponse {
  status: number;
  body: string;
}

export interface RequestOptions {
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

/**
 * One request against a loopback board.
 *
 * The host is always `127.0.0.1`, which is also what lands in the `Host` header
 * — the server's allow-list accepts `localhost`, `127.0.0.1` and `[::1]` and
 * refuses anything else with a 403, because a name that merely resolves to
 * loopback is how a page on another site reads a local board. Node sends no
 * `Origin` and no `Sec-Fetch-Site`, so the same-origin check on writes passes
 * exactly as it does for curl and `aboard apply`.
 */
export function httpRequest(port: number, urlPath: string, options: RequestOptions = {}): Promise<HttpResponse> {
  const { method = 'GET', body, headers = {}, timeoutMs = 5000 } = options;
  return new Promise((resolve, reject) => {
    // Every path out of this request has to settle the promise exactly once.
    // A promise that never settles is the worst failure this client can have:
    // `discover()` holds its re-entrancy flag across the await, so one hung
    // request stopped every future discovery for the life of the window, with
    // no error anywhere — the tree simply froze. Measured: a server that writes
    // a Content-Length and then destroys the socket left `state()` pending
    // forever, because the only listeners were `res.on('data')` and
    // `res.on('end')`, and a destroyed response emits neither.
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      fn();
    };
    const fail = (err: unknown) =>
      done(() =>
        reject(
          err instanceof BoardError
            ? err
            : new BoardError(`${method} ${urlPath}: ${err instanceof Error ? err.message : String(err)}`),
        ),
      );

    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: {
          Accept: 'application/json',
          ...(body === undefined ? {} : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }),
          ...headers,
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => done(() => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })));
        // A response cut off mid-body: the board was killed, or something on the
        // socket gave up. Both spellings, because which one arrives depends on
        // the Node version and on whether a Content-Length was promised.
        res.on('aborted', () => fail(new BoardError(`${method} ${urlPath}: the board closed the connection mid-answer`)));
        res.on('error', fail);
      },
    );
    req.setTimeout(timeoutMs, () => {
      req.destroy(new BoardError(`no answer from the board on port ${port} within ${timeoutMs}ms`));
    });
    req.on('error', fail);
    // The last resort. If the request ends without a response and without an
    // error — which `destroy()` with no argument does — this is the only event
    // left, and settling late beats not settling.
    req.on('close', () => fail(new BoardError(`${method} ${urlPath}: the connection closed before the board answered`)));
    if (body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

function parseJson<T>(res: HttpResponse, what: string): T {
  try {
    return JSON.parse(res.body) as T;
  } catch {
    throw new BoardError(`${what} did not answer with JSON (HTTP ${res.status})`, res.status);
  }
}

export interface WriteResult {
  rev?: number;
  updatedAt?: string;
  /** True when the edit reported nothing to do, so nothing was posted. */
  skipped?: boolean;
}

/**
 * An edit applied to a FRESH copy of the document.
 *
 * It is a callback rather than a finished document on purpose: a 409 means
 * somebody else's write landed first, and the only correct response is to
 * re-read and redo the edit on what is actually there. Handing `write` a
 * pre-built document would make the retry replay a stale one, which is the
 * clobber the compare-and-set exists to prevent.
 *
 * Return `false` to abandon the write (the tab vanished, the marker was already
 * cleared) — a no-op beats posting a document that changes nothing and stamps a
 * new revision under everyone else.
 */
export type Edit = (doc: Doc) => boolean | void;

export interface EventHandlers {
  onState?(origin: string | null): void;
  onWaiters?(count: number): void;
  onStatus?(connected: boolean, detail?: string): void;
}

export interface Subscription {
  dispose(): void;
}

/** A discovered, health-checked board. */
export class Board {
  readonly base: string;

  constructor(
    readonly projectRoot: string,
    readonly instanceFile: string,
    readonly instance: Instance,
  ) {
    this.base = basePathOf(instance);
  }

  get port(): number {
    return this.instance.port;
  }

  get name(): string {
    return this.instance.name ?? '';
  }

  /** The origin the extension itself talks to. Always loopback, never the reported URL. */
  get origin(): string {
    return `http://127.0.0.1:${this.instance.port}`;
  }

  /** What the panel frames and what "copy link" is built from. */
  get boardUrl(): string {
    return `${this.origin}${this.base}/`;
  }

  /** A label that tells two boards apart in one tree. */
  get title(): string {
    const folder = path.basename(this.projectRoot) || this.projectRoot;
    return this.name ? `${folder} · ${this.name}` : folder;
  }

  private path(route: string): string {
    return `${this.base}${route}`;
  }

  async health(timeoutMs = 1500): Promise<Instance> {
    const res = await httpRequest(this.port, this.path('/health'), { timeoutMs });
    if (res.status !== 200) {
      throw new BoardError(`GET /health answered ${res.status}`, res.status);
    }
    return parseJson<Instance>(res, 'GET /health');
  }

  async state(): Promise<Doc> {
    const res = await httpRequest(this.port, this.path('/aboard.json'));
    if (res.status !== 200) {
      throw new BoardError(`GET /aboard.json answered ${res.status}`, res.status);
    }
    const doc = parseJson<Doc>(res, 'GET /aboard.json');
    if (!Array.isArray(doc.tabs)) {
      throw new BoardError('the board answered with a document that has no tabs array');
    }
    return doc;
  }

  /**
   * Ask the shell whether it understands `?chrome=`.
   *
   * `undefined` means "could not tell" — a non-200, an empty body, a refused
   * connection. The caller says nothing in that case; see shellSupportsChrome.
   *
   * `Accept: text/html` rather than this client's usual JSON, because this is
   * the one route that answers with a page.
   */
  async supportsChrome(timeoutMs = 2500): Promise<boolean | undefined> {
    try {
      const res = await httpRequest(this.port, this.path('/'), { timeoutMs, headers: { Accept: 'text/html' } });
      if (res.status !== 200 || res.body === '') {
        return undefined;
      }
      return shellSupportsChrome(res.body);
    } catch {
      return undefined;
    }
  }

  async capabilities(): Promise<Capabilities> {
    const res = await httpRequest(this.port, this.path('/capabilities'));
    if (res.status !== 200) {
      throw new BoardError(`GET /capabilities answered ${res.status}`, res.status);
    }
    return parseJson<Capabilities>(res, 'GET /capabilities');
  }

  async waiters(): Promise<Waiters> {
    const res = await httpRequest(this.port, this.path('/waiters'));
    if (res.status !== 200) {
      throw new BoardError(`GET /waiters answered ${res.status}`, res.status);
    }
    return parseJson<Waiters>(res, 'GET /waiters');
  }

  async poke(note?: string): Promise<number> {
    const res = await httpRequest(this.port, this.path('/poke'), {
      method: 'POST',
      body: JSON.stringify({ by: 'human', ...(note ? { note } : {}) }),
    });
    if (res.status !== 200) {
      throw new BoardError(`POST /poke answered ${res.status}`, res.status);
    }
    const out = parseJson<{ released?: number }>(res, 'POST /poke');
    return out.released ?? 0;
  }

  /**
   * Read → edit → compare-and-set, with exactly ONE retry on 409.
   *
   * One, not a loop: a retry loop against a board an agent is writing to in a
   * tight run would spin, and the human is standing at the keyboard. Two
   * attempts covers the ordinary race — an agent's write landing between this
   * read and this post — and anything past that is a real disagreement worth
   * telling them about rather than resolving silently.
   */
  async write(edit: Edit, options: { attempts?: number } = {}): Promise<WriteResult> {
    const attempts = options.attempts ?? 2;
    let last: HttpResponse | undefined;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const doc = await this.state();
      const next = JSON.parse(JSON.stringify(doc)) as Doc;
      if (edit(next) === false) {
        return { rev: doc.rev, skipped: true };
      }
      // `rev` is the token. A document with no `rev` at all predates the counter
      // (the server accepts a timestamp base exactly once, on such a document,
      // and gives it a rev on that very write), so fall back to `updatedAt`
      // rather than giving up compare-and-set entirely and posting blind.
      const base: number | string | null =
        typeof doc.rev === 'number' ? doc.rev : typeof doc.updatedAt === 'string' ? doc.updatedAt : null;
      const payload = JSON.stringify({ ...next, __base: base, __by: 'human', __origin: 'vscode' });
      const res = await httpRequest(this.port, this.path('/aboard.json'), { method: 'POST', body: payload });
      if (res.status === 200) {
        return parseJson<WriteResult>(res, 'POST /aboard.json');
      }
      last = res;
      if (res.status !== 409) {
        break;
      }
    }
    const detail = last ? describeWriteFailure(last) : 'the write was never attempted';
    throw new BoardError(detail, last?.status);
  }

  /**
   * The SSE stream, with reconnect and backoff.
   *
   * `ui` frames are dropped here and nowhere else: they are the board telling a
   * PAGE that its own code changed, which the board handles by reloading itself.
   * An extension acting on one would refresh a tree for a reason that has
   * nothing to do with the tree.
   */
  events(handlers: EventHandlers): Subscription {
    let closed = false;
    let attempt = 0;
    // Which connection the handlers below belong to. One dropped socket can
    // announce itself twice — `error` on the response and then `error` on the
    // request is the ordinary shape of a killed server — and each announcement
    // used to schedule its own reconnect, so a single drop could leave two live
    // streams delivering every frame twice, forever, with no way back to one.
    let generation = 0;
    let req: http.ClientRequest | undefined;
    let timer: NodeJS.Timeout | undefined;
    let stable: NodeJS.Timeout | undefined;

    const reconnect = (gen: number, detail: string) => {
      if (closed || gen !== generation) {
        return;
      }
      generation += 1;
      if (stable) {
        clearTimeout(stable);
        stable = undefined;
      }
      if (timer) {
        clearTimeout(timer);
      }
      attempt += 1;
      handlers.onStatus?.(false, detail);
      timer = setTimeout(connect, backoffDelay(attempt));
    };

    const connect = () => {
      if (closed) {
        return;
      }
      const gen = generation;
      const parser = new SseParser();
      req = http.request(
        {
          host: '127.0.0.1',
          port: this.port,
          path: this.path('/events'),
          method: 'GET',
          headers: { Accept: 'text/event-stream' },
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            reconnect(gen, `GET /events answered ${res.statusCode}`);
            return;
          }
          handlers.onStatus?.(true);
          // The backoff resets when the stream has PROVED itself, not when the
          // headers arrive. Resetting on the headers meant a port that accepts a
          // connection and drops it — a board crash-looping, a proxy closing an
          // idle stream, something else that grabbed the port — reconnected at
          // the 1s floor for the life of the window and never backed off at all,
          // which is exactly what backoffDelay exists to prevent. Measured: four
          // connections in 3.5s, one output-channel line each, indefinitely.
          stable = setTimeout(() => {
            attempt = 0;
          }, STABLE_STREAM_MS);
          // A ten-second timer must not be what keeps a Node process alive; the
          // stream's own socket is the thing with a reason to.
          stable.unref?.();
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => {
            for (const value of parser.push(chunk)) {
              dispatch(classifyFrame(value), handlers);
            }
          });
          res.on('end', () => reconnect(gen, 'the board closed the event stream'));
          res.on('error', (err: Error) => reconnect(gen, err.message));
        },
      );
      // No socket timeout: this stream is idle by design between writes, and a
      // timeout would tear down a perfectly healthy connection every N seconds.
      req.on('error', (err: Error) => reconnect(gen, err.message));
      req.end();
    };

    connect();

    return {
      dispose() {
        closed = true;
        if (timer) {
          clearTimeout(timer);
        }
        if (stable) {
          clearTimeout(stable);
        }
        req?.destroy();
      },
    };
  }
}

/**
 * How long a stream has to stay up before it counts as a working connection.
 *
 * Ten seconds is well past the board's own `retry: 1000` and well short of any
 * interval a human would notice: a genuine restart still reconnects in about a
 * second, because the connection it replaced had been up for minutes.
 */
const STABLE_STREAM_MS = 10_000;

function dispatch(frame: BoardFrame, handlers: EventHandlers): void {
  switch (frame.kind) {
    case 'state':
      handlers.onState?.(frame.origin);
      return;
    case 'waiters':
      handlers.onWaiters?.(frame.count);
      return;
    case 'ui':
    case 'unknown':
      // Deliberately nothing. See the doc comment on BoardFrame.
      return;
  }
}

/** Turn a refused write into a sentence a human can act on. */
export function describeWriteFailure(res: HttpResponse): string {
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(res.body) as Record<string, unknown>;
  } catch {
    parsed = undefined;
  }
  const reason = typeof parsed?.reason === 'string' ? parsed.reason : undefined;
  const error = typeof parsed?.error === 'string' ? parsed.error : undefined;
  if (res.status === 409) {
    return `the board changed while you were editing — ${reason ?? 'someone else wrote first'}. Nothing was overwritten; try again.`;
  }
  return `the board refused the write (HTTP ${res.status})${reason ? `: ${reason}` : error ? `: ${error}` : ''}`;
}

/**
 * Verify a discovered instance and turn it into a Board, or say why not.
 *
 * Never throws: an unreachable port is the ordinary case (the board is not
 * running) and the caller has a fallback for it.
 */
export async function verify(candidate: Candidate, timeoutMs = 1500): Promise<{ board?: Board; reason?: string }> {
  const base = basePathOf(candidate.instance);
  try {
    const res = await httpRequest(candidate.instance.port, `${base}/health`, { timeoutMs });
    if (res.status !== 200) {
      return { reason: `port ${candidate.instance.port} answered ${res.status} on /health` };
    }
    let body: unknown;
    try {
      body = JSON.parse(res.body);
    } catch {
      return { reason: `port ${candidate.instance.port} answered /health with something that is not JSON` };
    }
    const verdict = acceptHealth(body, candidate.projectRoot);
    if (!verdict.ok) {
      return { reason: verdict.reason };
    }
    // Prefer the LIVE record over the file: the file was written at startup and
    // the server is the thing actually serving. They agree in the normal case.
    return { board: new Board(candidate.projectRoot, candidate.instanceFile, body as Instance) };
  } catch (err) {
    return { reason: err instanceof Error ? err.message : String(err) };
  }
}
