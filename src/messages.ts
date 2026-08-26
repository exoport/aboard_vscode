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
 * `{__aboard: 'active', tab}` — §5 of `handoff-board-for-vscode-panel.md`, landed
 * on the aboard side (plan-2 item 7). It is sent when the active tab CHANGES, not
 * on every repaint, so a receiver may act on each message it gets. The webview
 * authenticates it by `e.source` (the frame is cross-origin by design, so the
 * origin is not the check) and forwards it in this shape.
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
