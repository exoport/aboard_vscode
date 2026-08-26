// The webview ↔ extension messages, parsed rather than trusted.
//
// A webview is a browser context: everything arriving from it is input. These
// are tiny, which is the point — the envelope is validated in one testable place
// so no handler has to remember to.

/** Extension → webview. */
export type ToWebview =
  | { type: 'goto'; tab: string }
  | { type: 'load'; url: string };

/** Webview → extension. */
export type FromWebview = { type: 'active'; tab: string } | { type: 'ready' };

/**
 * The board announces its own tab switches ([ ], 1–9, and its choice on load) as
 * `{__aboard: 'active', tab}` — §5 of `handoff-board-for-vscode-panel.md`, which
 * has NOT landed on the aboard side yet. The webview authenticates it by
 * `e.source` (the frame is cross-origin by design, so the origin is not the
 * check) and forwards it in this shape.
 *
 * Until that message ships the tree highlight only follows clicks that started
 * in the tree, and drifts when the human presses `]` inside the panel. That was
 * accepted rather than blocking on the other repo; this parser is what makes it
 * start working the day it lands, with no change here.
 */
export function parseWebviewMessage(raw: unknown): FromWebview | undefined {
  if (typeof raw !== 'object' || raw === null) {
    return undefined;
  }
  const msg = raw as Record<string, unknown>;
  // The page says this once, after its script runs. Without it a `goto` sent
  // while the webview was still loading would be dropped on the floor — which is
  // exactly the first one, the click that opened the panel.
  if (msg.type === 'ready') {
    return { type: 'ready' };
  }
  if (msg.type !== 'active') {
    return undefined;
  }
  if (typeof msg.tab !== 'string' || msg.tab === '') {
    return undefined;
  }
  return { type: 'active', tab: msg.tab };
}
