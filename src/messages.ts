// The webview ↔ extension messages, parsed rather than trusted.
//
// A webview is a browser context: everything arriving from it is input. These
// are tiny, which is the point — the envelope is validated in one testable place
// so no handler has to remember to.

import type { BoardThemeKind } from './theme';

/** Extension → webview. */
export type ToWebview =
  /** Point the frame at a tab. `src` is built by `frameSrc()` and carries the nonce. */
  | { type: 'goto'; tab: string; src: string }
  /** The board's palette, derived from the editor's theme. Forwarded into the frame. */
  | { type: 'theme'; kind?: BoardThemeKind; tokens: Record<string, string> }
  /**
   * Read the `--vscode-*` variables again and report them.
   *
   * Sent when `window.onDidChangeActiveColorTheme` fires. The page watches its
   * own body class, which catches a switch between dark and light — but two dark
   * themes differ in their VALUES and not in that class, and nothing inside a
   * webview is notified about that. The host is.
   */
  | { type: 'theme-probe' };

/** Webview → extension. */
export type FromWebview =
  | { type: 'active'; tab: string }
  | { type: 'ready' }
  | { type: 'theme'; vars: Record<string, string>; bodyClass: string };

/**
 * The board announces its own tab switches ([ ], 1–9, and its choice on load) as
 * `{__aboard: 'active', tab}` — the aboard side of this landed on 2026-08-26 and is
 * documented in that repo's `docs/reference/http-api.md`, "What the shell posts to an
 * embedder". It is sent when the active tab CHANGES, not
 * on every repaint, so a receiver may act on each message it gets. The webview
 * authenticates it by `e.source` (the frame is cross-origin by design, so the
 * origin is not the check) and forwards it in this shape.
 *
 * The `theme` report goes the other way round from everything else here: it is
 * the page telling the host something only the page can see. The `--vscode-*`
 * custom properties exist on the webview document's root and nowhere else — the
 * extension-host API has `ColorTheme.kind` and no values — so the page reads
 * them raw and the mapping happens in `src/theme.ts`, where it is testable.
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
  if (msg.type === 'theme') {
    if (typeof msg.bodyClass !== 'string' || typeof msg.vars !== 'object' || msg.vars === null) {
      return undefined;
    }
    // Copied key by key, and only the string values. `getPropertyValue` returns
    // `''` for a variable this window does not have, and an empty string is not
    // a colour — dropping it here is what makes "absent" one case in
    // `mapVscodeTheme` instead of two.
    const vars: Record<string, string> = {};
    for (const [name, value] of Object.entries(msg.vars as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim() !== '') {
        vars[name] = value.trim();
      }
    }
    return { type: 'theme', vars, bodyClass: msg.bodyClass };
  }
  if (msg.type !== 'active') {
    return undefined;
  }
  if (typeof msg.tab !== 'string' || msg.tab === '') {
    return undefined;
  }
  return { type: 'active', tab: msg.tab };
}
