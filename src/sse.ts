// SSE framing and the three frame kinds, kept pure so they can be tested
// without a socket. `board.ts` owns the connection; this owns the bytes.

/**
 * Incremental `text/event-stream` reader.
 *
 * Only `data:` matters here — the board sends no `event:` names and no ids, and
 * its `retry:` line is handled by the reconnect policy in board.ts rather than
 * by this parser. Comment lines (`:`) and unknown fields are dropped. A frame is
 * complete at the blank line, which is the only reason this has to buffer at
 * all: a chunk boundary can fall anywhere, including inside a JSON object.
 */
export class SseParser {
  private buffer = '';
  private data: string[] = [];

  /** Feed a chunk; get back the JSON values of every frame it completed. */
  push(chunk: string): unknown[] {
    this.buffer += chunk;
    const out: unknown[] = [];
    // Normalise CRLF and lone CR the spec allows, so a line is a line.
    let idx: number;
    while ((idx = this.buffer.search(/\r\n|\n|\r/)) !== -1) {
      const line = this.buffer.slice(0, idx);
      const width = this.buffer.startsWith('\r\n', idx) ? 2 : 1;
      this.buffer = this.buffer.slice(idx + width);
      if (line === '') {
        const payload = this.data.join('\n');
        this.data = [];
        if (payload === '') {
          continue;
        }
        try {
          out.push(JSON.parse(payload));
        } catch {
          // A frame that is not JSON is not this board's. Dropping it beats
          // tearing the stream down: the next frame is very likely fine.
        }
        continue;
      }
      if (line.startsWith(':')) {
        continue;
      }
      const colon = line.indexOf(':');
      const field = colon === -1 ? line : line.slice(0, colon);
      let value = colon === -1 ? '' : line.slice(colon + 1);
      if (value.startsWith(' ')) {
        value = value.slice(1);
      }
      if (field === 'data') {
        this.data.push(value);
      }
    }
    return out;
  }
}

export type BoardFrame =
  /** The state file changed; `origin` is the writer's client id, null if unknown. */
  | { kind: 'state'; origin: string | null }
  /** How many sessions are blocked on `/wait` right now. */
  | { kind: 'waiters'; count: number }
  /**
   * The signature of the UI the server is serving. The board handles this
   * itself — the page reloads itself when its own code changed — and the
   * extension must ignore it entirely. It is listed rather than folded into
   * `unknown` so that ignoring it is a decision in the code, not an omission.
   */
  | { kind: 'ui' }
  | { kind: 'unknown' };

/** Tell the three frame kinds apart by key, as the server does. */
export function classifyFrame(value: unknown): BoardFrame {
  if (typeof value !== 'object' || value === null) {
    return { kind: 'unknown' };
  }
  const frame = value as Record<string, unknown>;
  if ('ui' in frame) {
    return { kind: 'ui' };
  }
  if ('waiters' in frame) {
    const n = frame.waiters;
    return { kind: 'waiters', count: typeof n === 'number' ? n : 0 };
  }
  if ('origin' in frame) {
    const o = frame.origin;
    return { kind: 'state', origin: typeof o === 'string' ? o : null };
  }
  return { kind: 'unknown' };
}

/**
 * Reconnect delay: 1s doubling to 30s.
 *
 * The board's own `retry: 1000` is the browser EventSource's floor, and this
 * mirrors it for the first attempt so a restart is picked up about as fast as
 * the page picks it up. It backs off after that because the other reason a
 * stream drops is a server that is not coming back, and a fixed 1s poll against
 * a dead port is a busy loop with a log line per second.
 */
export function backoffDelay(attempt: number): number {
  const ms = 1000 * 2 ** Math.max(0, attempt - 1);
  return Math.min(ms, 30_000);
}
