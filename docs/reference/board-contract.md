# The board contract

This is the whole coupling between the two repositories — **a contract, not a shared
file**. Its authority is `docs/reference/http-api.md` in the
[aboard](https://github.com/exoport/aboard) repository; what follows is that document
reduced to the parts a viewer uses, plus the messages that cross the webview's frame
boundary in both directions.

Nothing here is generated. If you are changing either side, read the aboard page as well
as this one.

## Calls

| call | use |
|---|---|
| `<root>/.aboard/run/instance.json`, found by **walking up** from each workspace folder | port discovery, mirroring how `aboard` itself finds its project root. Never assume a port: it is derived from the discovered root's path. `instance.<name>.json` is a named board on the same project. See [discovery and starting a board](discovery-and-start.md). |
| `GET /health` | liveness; `version` for the status bar; `project`, compared against the discovered root (a stale instance file from a dead server is otherwise indistinguishable from a live one); `app`, which is `aboard` or `ape-aboard`; `base`, the URL prefix when the server was started with `--base-path`. |
| `GET /aboard.json` | the tree: per tab `id`, `name`, `type`, `note`, `touched{by,at,note}`, `pendingRemoval{by,reason}`. |
| `GET /events` (SSE) | live refresh. Three frame kinds on one stream, told apart by key: `origin` → the state changed; `waiters` → the notify count changed; `ui` → the *page's* own code changed, which the board handles itself and **this extension ignores entirely**. |
| `GET /capabilities` | `{type, label, blurb, …}` per renderer, for tooltips, and `schema` for noticing drift — so no type label and no schema number is hardcoded here. |
| `POST /aboard.json` | writes: the whole document plus `__base`, `__by: "human"`, `__origin: "vscode"`. `409` → re-read, redo the edit, retry **once**, then tell the human. |
| `GET /` | the shell the panel frames — and, read once per board, the probe for whether this binary understands `?chrome=` (it stamps `document.body.dataset.chrome`). The manifest has no field for it; see [why the shell is probed](../explanation/why-the-shell-is-probed.md). |
| `POST /poke` · `GET /waiters` | the nudge channel: the view-title button, a status-bar item and a command. `/waiters` is read on every reload as well as followed on the stream, because the `waiters` frame is only sent when the count CHANGES — a session that parked before the window opened is invisible to the frame alone. |
| `#tab=<id>` on the board URL | navigation, and "copy link to this tab". |

## Messages across the frame boundary

| message | direction | use |
|---|---|---|
| `{__aboard: 'active', tab}` | OUT of the frame | the board announcing its own tab switches, so the sidebar highlight follows `[`, `]` and `1`–`9` pressed inside the panel. Authenticated by `event.source`, never by origin. |
| `{__aboard: 'theme', kind, tokens}` | INTO the frame | the editor's colours, as the board's own 21 tokens. Per viewer, applied as inline custom properties, **written nowhere** — not the state file, not `localStorage`. Governed by the `aboard.theme` setting; see [theme mapping](theme.md). |
| `{__aboard: 'clipboard-image', id, dataUrl}` OUT, `{__aboard: 'clipboard-result', id, ok, error}` back IN | both | the board asking this extension to put a PNG on the system clipboard, because a webview cannot. Handled in `src/clipboard.ts` by running `xclip`. The board does not know it is talking to VS Code — it asks whoever framed it and treats silence as a refusal. See [why the host copies images](../explanation/why-the-host-copies-images.md). |
| `{__aboard: 'host', name, clipboard}` | INTO the frame | what this host can do FOR the board, on every frame load. Recorded as `window.ABOARD_HOST` and re-emitted as an `aboard:host` event. It exists so the board never has to learn its host's abilities by timing out: a timeout cannot tell "nothing framed me" from "an old extension framed me" from "the host broke", and those three need three different sentences in front of a human. `clipboard: true` promises an ANSWER, not a success. |
| `{__aboard: 'newtab'}` | INTO the frame | the sidebar's **New Tab** button. `?chrome=notabs` hides the board's whole tab strip including its own `+`, so this is how the button reaches the sheet — which the BOARD draws. Nothing about types or empty states passes through here, which is what keeps this repository free of the board's schema. |
| `goto` | INTO the frame | navigation from the tree. Accepted only for a src that starts with the one the frame was rendered with — the board's `html` tabs are sandboxed frames that can reach `window.top`, and this handler is the only thing on the page that navigates anything. The CSP already pins the origin; this pins the base path too. The invariant it rests on — that every `frameSrc()` value starts with the no-tab form — is asserted in `test/model.test.ts`, since `panel.html` is a file no unit test can load. |

## The URL the panel frames

```
<base>?chrome=notabs#tab=<id>&r=<n>
```

Asserted as a whole string in the tests. `?chrome=notabs` suppresses the board's own tab
strip for that viewer; `r=<n>` is a counter that changes on every navigation.

## Four facts the design rests on

- **`__base` is the `rev`**, a counter the server increments on every accepted write —
  *not* `updatedAt`. A millisecond timestamp is not a token: two writes inside one
  millisecond share a string, and a base built from the first still matched after the
  second had landed. A document with no `rev` at all predates the counter, and only then
  does this extension fall back to `updatedAt`.
- **An absent `__by` is `"unknown"`, which has agent powers only.** Dismissing a change
  marker, deleting a tab and answering a removal request are things the server refuses
  from an agent — by carrying the old value forward, with a `200`. Get `__by` wrong and
  every human-only action here becomes a silent no-op.
- **A fragment-only change to an iframe's `src` fires `hashchange` without reloading the
  page**, which is why switching tabs from the sidebar costs no reload, no dropped SSE
  stream and no lost zoom. A changing `r=` counter rides along because the board does not
  write the hash back when the human switches tabs inside it, so the URL can already read
  `#tab=ab71` while the page shows something else.
- **The editor's colours exist only inside the webview.** VS Code puts the live theme on
  the webview document's root as `--vscode-*` custom properties; the extension-host API
  gives `ColorTheme.kind` and no values at all, and the board's iframe is cross-origin so
  it inherits none of them. That one fact decides the whole shape of [the theme
  feature](theme.md).

## Two things the board owed this extension — both landed

Both are specified in the aboard repository's `docs/reference/http-api.md` — `?chrome=`
and "What the shell posts to an embedder" — and both **shipped on 2026-08-26**. This
repository needed no change to take them: it had coded for both from the start, because
each was free to send and would only ever have cost a change here later.

- **`?chrome=notabs`** — hides the board's own tab strip, so the panel shows one strip rather than two. `frameSrc()` has always asked for it.
- **`{__aboard: 'active', tab}`** — the board announces its own tab switches, so the sidebar highlight follows keys pressed inside the panel and not only clicks that started in the tree. `media/panel.html` has always listened for it.

**An older board silently ignores the first of these**, because an unknown query
parameter is not an error. This extension probes for it and says so, once per board, in a
warning that names the board and its version — see [why the shell is
probed](../explanation/why-the-shell-is-probed.md).

## See also

- [What it does](what-it-does.md) — the surfaces these calls feed.
- [Discovery and starting a board](discovery-and-start.md) — how the base URL is arrived at in the first place.
- [What this extension is](../explanation/what-this-extension-is.md) — why the coupling is a contract rather than a shared file.
