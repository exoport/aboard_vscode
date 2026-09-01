# Observed in a real editor

Nothing below can be asserted headlessly. This is the record of what a human has actually
watched happen, with the date, and it is the honest half of every status claim in this
documentation.

- **`[x]`** was observed.
- **`[~]`** means the part that can be driven against a real board is proven and the part that needs a human looking at VS Code is not — a full tick there would claim more than anybody has seen.
- **`[ ]`** is still open.

The list was worked through twice on **2026-08-26**, both times in an Extension
Development Host against a scratch project with a board running. The first pass reached
the top four rows and stopped on two defects; the second went through everything left and
passed all of it but two, which became the two `[~]` rows. Both were fixed; the nudge one
was then watched end to end on 2026-08-27, and the copy one is still `[~]`.

## The list

- [x] The extension activates and the tree lists every tab, in `aboard.json` order, each with its id as the description. (2026-08-26)
- [x] A board started AFTER the window was already open still appears — the `**/.aboard/run/instance*.json` watcher fires and discovery re-runs. (2026-08-26)
- [x] The board renders inside the panel. (2026-08-26)
- [x] Tab switching does not reload the page. (2026-08-26) This is the mechanism the whole navigation design rests on: a fragment-only `src` change fires `hashchange` without reloading, so no SSE stream drops and no renderer remounts.
- [x] The panel survives being dragged to another editor group, and being hidden and revealed — `retainContextWhenHidden`. (2026-08-26)
- [x] `html` tabs paint inside the panel, with a clean console. (2026-08-26) The webview console is the last word here and it was read: `connect-src 'none'` plus the `vscode-webview:` ancestor list is the containment, and neither showed up as a blocked request.
- [x] Dots appear within a second of an agent's write. (2026-08-26, third run) A periwinkle dot on a touched tab and a red one on a removal request, arriving with no Refresh after the stream fix. The first two runs needed Refresh — first the malformed SVGs, then Node 24's inspector killing the stream on every string chunk under F5. Dismiss from the sidebar was watched in the same session.
- [x] The board's own tab strip does NOT appear inside the panel on a current binary. (2026-08-26, against `aboard de7773f`)
- [x] A removal request shows red and both answers do what they say. (2026-08-26, fully) First through the board's own banner inside the panel, then through the sidebar's own Approve / Deny items. Both were proven headlessly first against a real spawned board — deliberately a server test rather than a unit one, because the same edit from an agent gets the tab RESTORED with a `pendingRemoval`, so a test that only checks what the edit does to a JSON object proves nothing about what the board does with it.
- [x] Rename and Set note from the sidebar. (2026-08-26) Both are ordinary writes; what is being checked is that they land as the HUMAN, since an agent renaming a tab is allowed and a wrong `__by` here would not fail visibly the way Dismiss does.
- [x] `]` inside the panel moves the tree highlight. (2026-08-26) The `{__aboard: 'active', tab}` message arriving and `reveal` acting on it.
- [x] Two viewers — the panel and a plain browser — open at once, disagreeing about chrome and agreeing about content, each on its own active tab. (2026-08-26) This row is the one that proves neither leaks into the state file.
- [x] Restarting the `aboard` server on the same root while the panel is open: the page reloads itself, the tree stays alive, no stale `app.css`. (2026-08-26)
- [x] A forced `409` — a write from the browser mid-edit — warns rather than clobbers. (2026-08-26)
- [x] The "Start the board" fallback: with nothing running the welcome view offers it, it picks the command from what is on `PATH`, and the tree fills in once the board answers. (2026-08-26)
- [x] The board follows the VS Code theme. (2026-08-26, and **high contrast both ways on 2026-08-27**) The board's own dark/light switch works inside the panel, and switching the VS Code theme recolours it. High-contrast **dark and light** were both worked through on 2026-08-27 and both came out right — which is the row that mattered most of the three, because HC light is the only place `themeKindFromBodyClass` can go wrong in a way no other theme reveals: a high-contrast light body carries `vscode-high-contrast` AND `vscode-high-contrast-light`, so testing the general class first would have rendered every one of them as a dark board inside a white editor. Machine-tested since it was written; now watched. It is also the only family that defines `contrastBorder`, so it is the only one where `--line-strong` comes from the theme at all. Still unobserved inside this row: `aboard.theme: board`. Note that full fidelity is **not** the expected result — on VS Code's own Dark+ the text colours are withheld by the contrast guard, so the backgrounds should match the editor while the type stays the board's. A panel whose text went grey-on-grey would be the guard failing, not the theme arriving.
- [x] **The nudge button lights only when a session is genuinely parked on `aboard wait`, and pressing it releases that session.** Failed on 2026-08-26, fixed, and **watched end to end on 2026-08-27**: an agent session parked on a real `aboard wait` against the human's own board, the view-title button drew the lit `$(zap)`, the human pressed *that* button, and the session came back with `{"event":"poke","by":"human"}` and exit 0. The idle `$(circle-slash)` had been seen earlier the same day. This is the row the whole `aboard.waiting` context key exists for. Machine half, still true: `test/integration.test.ts` parks a REAL `aboard wait` against a spawned board and asserts the key flips both ways. **One thing the evidence could not settle by itself** — `lastPoke` is `{event, at, by}` with `by` always `"human"`, so the board's own topbar button would have written an identical record; the human said which one they pressed. Recorded as a finding in the aboard repository's `development/README.md`, since a released agent can tell that it was poked and not by what.
- [x] **The panel and a browser tab on the same board look like the same product.** (2026-08-27) Both fixes in [theme mapping](theme.md), confirmed on FireFly Pro: the derived depth ramp (strips nearly flat, icon buttons dark rather than light grey pills) and the neutrals/voices split (the five mark swatches on a `markup` tab being five distinguishable colours, the same five a browser draws). Backgrounds still follow the editor's ground — that difference is the feature, not a miss. **It took two passes to get here and neither was caught by a test**, because both failures were made of individually valid colours.
- [x] **New Tab in the sidebar opens the board's own sheet, and the panel lands on the new tab.** (2026-08-27) The message hop is covered in `test/panelhtml.test.ts` and the board's half by `TestCreatingATabSwitchesToIt` in the aboard repository's browser suite; this row is the two of them meeting in a real host, which is the only place the `view/title` contribution, the webview `postMessage` and the board's `e.source` check are all real at once.
- [x] **Installed from the `.vsix`, rather than run under F5.** (2026-08-27, and in daily use since) `npm run package && code --install-extension aboard-vscode-*.vsix --force`, then a normal window on a project with a board. This is the only run with no debugger attached and from the packaged file list, so it is the only check that can catch a `.vscodeignore` that excludes something load-bearing — and the only one where the F5-only defects (Node 24's inspector killing the SSE stream) are guaranteed absent. It found four defects F5 had not.
- [x] **A cropped image region reaches the clipboard through `xclip`.** (2026-08-28) Copy region on a `markup` tab, then paste elsewhere. Everything up to the spawn is covered by `test/clipboard.test.ts`, the message hop by `test/panelhtml.test.ts` and the aboard repository's browser suite; what needed a human was an X session and a paste. Still unwatched inside this row: the **missing-tool** path, which `sudo apt remove xclip` is the way to check — the board must name the tool and offer the picture.
- [x] **ANSWERED for the webview itself, and the answer is no.** (2026-08-28) A cropped PNG cannot reach the clipboard from *inside* the panel and never will: Chromium refuses with *"The Clipboard API has been blocked because of a permissions policy applied to the current document"*. `media/panel.html` does send `allow="clipboard-write"`, which is necessary and not sufficient — the webview document above it must hold the permission before it can delegate it, and **VS Code exposes no way to ask for that**. Checked against `@types/vscode` rather than assumed: `WebviewOptions` offers `enableScripts`, `enableForms`, `enableCommandUris` and `localResourceRoots` and no permission field, and `vscode.env.clipboard` is `readText()` / `writeText(string)` — **text only, no image**.
- [~] **Copy Reference copies a reference, and Copy Link copies a link.** Failed on 2026-08-26 and fixed. Both commands are pressed through their registered handlers with the tree node VS Code would hand them (`test/copy.test.ts`), and the two titles are asserted as manifest data (`test/manifest.test.ts`). Not proven: that both items appear on the right-click menu in that order, which is a `menus` contribution only a host evaluates.
- [ ] **The nudge button, in both states, on a real toolbar.** `$(zap)` with an agent parked on `aboard wait` and `$(circle-slash)` with none. Asserted as manifest data in `test/manifest.test.ts` and pressed through its handler in `test/notify.test.ts`, but which glyph VS Code actually paints for a `view/title` entry is something only a host draws.
- [ ] **The stream survives a board restart, and a board that will NOT come back stops being retried every second.** Kill `aboard serve` and watch the Aboard output channel: the reconnect notices should space out, not tick once a second. The row about the page reloading covers the restart the *board* notices; this one is the extension's own backoff, which is a different mechanism.
- [ ] *Optional:* **the old-binary warning.** A board served by a binary that predates `?chrome=` raises exactly one warning naming the board and its version. Asserted by `test/oldboard.test.ts`, including the in-flight-write case that used to fire it three times, but never seen in a real host — and increasingly hard to arrange, since it needs an `aboard` built before 2026-08-26 03:34.
- [ ] *Optional:* **Remote SSH / Codespaces.** `asExternalUri` + `portMapping` are coded and the webview CSP lists the externalised origin alongside both loopback spellings. Only a real remote window can confirm it, and nothing else here depends on it.

## Two rows ticked when these docs were written

The `.vsix` install row and the `xclip` row were still `[ ]` in `README.md` while its own
status summary already recorded both as watched — the install on 2026-08-27 (it is what
found four defects F5 had not) and the clipboard round trip on 2026-08-28. They are
ticked here to the dates the summary gave, with the part of the clipboard row nobody has
actually seen — the missing-tool path — left inside it rather than ticked with the rest.

## What this list is for

Every defect of consequence in this extension was found by a human looking at a screen,
and not one was visible to `node --test`. That is why this page exists and why it carries
dates. See [the failure mode is
silence](../explanation/the-failure-mode-is-silence.md).

The rest is covered by `npm test` — `node --test`, no framework. The count is in the run
rather than written down here, because a hand-maintained one lies eventually.
