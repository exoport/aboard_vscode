# Repository layout

```
package.json            contributes, activation, commands, menus
esbuild.mjs             one bundle to dist/extension.js
src/
  extension.ts          activate(): discover, register the tree and the commands
  board.ts              HTTP client and the discovery walk — no `vscode` import
  model.ts              document → what the tree shows, and the edits — no `vscode` import
  sse.ts                frame parsing and the reconnect delay — no `vscode` import
  launch.ts             which start command, and the PATH probe — no `vscode` import
  messages.ts           the webview envelope, parsed rather than trusted
  theme.ts              VS Code's colours → the board's 21 tokens — no `vscode` import
  clipboard.ts          the PNG hop: a temp file and `xclip`/`wl-copy` — no `vscode` import
  tree.ts               TreeDataProvider, a translation of model.ts
  panel.ts              WebviewPanel host and the bridge
  tokens.ts             the ONE place a colour is copied from aboard's app.css
media/
  panel.html            the shell: CSP, one iframe, and the bridge — goto, active, theme
  dot-change.svg        --agent  #a7adf4
  dot-removal.svg       --danger #ff0066
  activity.svg          the activity-bar icon (currentColor; VS Code tints it)
docs/                   this documentation, in Diátaxis quadrants
test/
  vscode-stub.ts        a stand-in `vscode` module — NOT a test file, and never an emulator
  fakeboard.ts          a board-shaped HTTP server, with activate() on top — also not a test file
  integration.test.ts   spawns a real aboard and drives activate() against it
  oldboard.test.ts      a board that predates ?chrome=, and the one warning it earns
  notify.test.ts        the aboard.waiting context key, and both ways it is fed
  copy.test.ts          Copy Reference and Copy Link, pressed as a human presses them
  clipboard.test.ts     the tool table, driven by stand-ins built from `node` itself
  manifest.test.ts      the contributions as data — the half no runtime test can see
  media.test.ts         the icon files parse, and the check can be seen failing
  panelhtml.test.ts     media/panel.html's bridge script, run in node:vm
  …plus board/boundary/discovery/health/launch/messages/model/sse/theme/tokens .test.ts,
   one per pure module, named after the file they cover
```

## Where the `vscode` import stops

At `extension.ts`, `tree.ts` and `panel.ts`, on purpose: everything with a rule worth
arguing about lives on the other side of that line, where `node --test` can reach it. The
discovery walk, the document-to-tree mapping, the edits, the SSE frame parsing, the URL
construction, the launch decision and the whole theme mapping are all pure modules.

It is also why the test count is meaningful and the coverage number would not be: none of
the tested code touches the editor.

## The two files in `test/` that are not tests

- **`test/vscode-stub.ts` must never become a VS Code emulator.** It models only what the extension actually depends on: a synchronous `EventEmitter`, a TreeView that re-walks `getChildren`/`getTreeItem` when `onDidChangeTreeData` fires, `setContext`, notifications and clipboard writes recorded rather than performed, the status-bar item, and the provider's own node behind each rendered row — that last one because it is exactly what VS Code hands a `view/item/context` command, so a test can press a menu item the way a human does rather than calling the function under it.
- **`test/fakeboard.ts`** is a board-shaped HTTP server with `activate()` on top, for the cases a real binary would make slow or non-deterministic.

**`panel.ts` stays deliberately uncovered.** Covering it would mean a fake webview, and
that is precisely where a stand-in becomes an emulator. `media/panel.html`'s bridge script
is reached instead, by running it in `node:vm` (`test/panelhtml.test.ts`).

## What ships in the `.vsix`

Eleven files: `dist/extension.js`, the four in `media/`, `package.json`, `readme.md`,
`changelog.md`, `LICENSE.txt` and the two archive manifests. `src/`, `test/`, `docs/`,
`out/`, `node_modules/`, the esbuild config and every `.map` stay out, which is what
`.vscodeignore` is for. `npx vsce ls` prints the list without building anything.

Check that list in vsce's own output when you package: a `.vscodeignore` that stops
matching is silent.
