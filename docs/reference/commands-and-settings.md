# Commands and settings

Everything the manifest contributes. The titles, the icons and the menu placements are
asserted as data in `test/manifest.test.ts`, which is the half of the extension no
runtime test can see.

Extension id `aboard-vscode`, publisher `exoport`, display name **Aboard Panel**. Both
the id and the display name were judgement calls made when the scaffold landed and should
stay stable now that they are chosen.

## Commands

Every command is in the **Aboard** category. The palette column says whether it is
reachable from the command palette — the ones marked no are contributed with
`"when": "false"`, because they need a tree node or a context that the palette cannot
supply.

| command | title | icon | palette | where |
|---|---|---|---|---|
| `aboard.open` | Open Board Panel | `$(window)` | yes | view title `navigation@1` |
| `aboard.newTab` | New Tab | `$(add)` | yes | view title `navigation@2`, when `aboard.hasBoard` |
| `aboard.nudge` | Nudge Waiting Agent | `$(zap)` | yes | status bar item |
| `aboard.nudgeIdle` | Nudge: no agent is waiting | `$(circle-slash)` | no | view title `navigation@3`, when `!aboard.waiting` |
| `aboard.nudgeWaiting` | Nudge: an agent is parked on aboard wait — click to release it | `$(zap)` | no | view title `navigation@3`, when `aboard.waiting` |
| `aboard.refresh` | Refresh | `$(refresh)` | yes | view title `navigation@4` |
| `aboard.start` | Start the Board | `$(play)` | yes | view title `1_run@1`, and both welcome views |
| `aboard.openTab` | Show Tab in Panel | — | no | a tree row's own click command |
| `aboard.dismissChange` | Dismiss Change | `$(check)` | no | row inline `inline@1` and context `2_edit@1`, when the row is `touched` |
| `aboard.approveRemoval` | Approve Removal | `$(trash)` | no | row context `1_removal@1`, when the row has a `removal` |
| `aboard.denyRemoval` | Deny Removal | `$(discard)` | no | row context `1_removal@2`, when the row has a `removal` |
| `aboard.rename` | Rename Tab | `$(edit)` | no | row context `2_edit@2` |
| `aboard.setNote` | Set Note | `$(note)` | no | row context `2_edit@3` |
| `aboard.copyId` | Copy Id | — | no | row context `3_copy@1` |
| `aboard.copyReference` | Copy Reference | — | no | row context `3_copy@2` |
| `aboard.copyLink` | Copy Link to This Tab | — | no | row context `3_copy@3` |

Two nudge commands run one handler. A `view/title` menu entry takes its icon *and* its
tooltip from the command it names, with no per-entry override, so two states mean two
command ids.

## Context keys

| key | set when | what reads it |
|---|---|---|
| `aboard.hasBoard` | at least one board is answering | the **New Tab** button, and both `viewsWelcome` clauses (negated) |
| `aboard.hasProject` | a workspace folder is at or under a directory holding `.aboard/` | which of the two welcome texts is shown |
| `aboard.waiting` | at least one session is parked on `aboard wait` | which nudge command occupies the view-title slot |

`aboard.hasBoard` being wrong is not a cosmetic failure: with it stuck true there is no
**Start the Board** button to press, because both welcome clauses are gated on its
negation and a view with children never shows a welcome view at all. That was the whole
of the v0.1.3 fix — a dropped event stream now arms a re-check rather than being logged
and discarded.

## Views

- **Activity-bar container** `aboard`, titled *Aboard*, icon `media/activity.svg` (drawn in `currentColor`, so VS Code tints it).
- **View** `aboard.tabs`, named *Tabs*, contextual title *Aboard*.

### Welcome views

| when | contents |
|---|---|
| `!aboard.hasBoard && aboard.hasProject` | "This project has an `.aboard/` directory, but no board is answering." + **Start the Board** |
| `!aboard.hasBoard && !aboard.hasProject` | "No `.aboard/` project was found in this workspace." + `aboard init` + **Start the Board** |

## Activation events

```
workspaceContains:**/.aboard/**
onCommand:aboard.open
onCommand:aboard.newTab
onCommand:aboard.refresh
onCommand:aboard.start
onCommand:aboard.nudge
onCommand:aboard.nudgeIdle
onCommand:aboard.nudgeWaiting
```

Once active, a file watcher on `**/.aboard/run/instance*.json` re-runs discovery, which
is how a board started *after* the window was open ever shows up.

## Settings

| setting | type | default |
|---|---|---|
| `aboard.theme` | `"follow"` \| `"board"` | `"follow"` |

- **`follow`** — derive the board's palette from your VS Code theme's colours and hand it to the board, so the panel belongs in the window. Applied for that viewer only; nothing is written to the board's state file, and other people looking at the same board are unaffected. Text colours are sent only when they reach the contrast the board pins its own type to (WCAG AAA, 7:1); when your theme does not, the backgrounds still follow it and the board keeps its own readable text.
- **`board`** — the extension sends no colours at all, and the board's own `.aboard/theme.json` and dark/light switch decide. The right setting for someone who deliberately keeps the board in the other variant from their editor.

Full rules in [theme mapping](theme.md); the practical version is [how to make the board
match your editor theme](../how-to/match-the-editor-theme.md).

## Engines and dependencies

`engines.vscode` is `^1.90.0` and `engines.node` is `>=20`. There are **no runtime
dependencies**; the dev ones are `typescript`, `esbuild`, `@vscode/vsce`, `@types/vscode`
and `@types/node`. `dist/extension.js` requires exactly four modules: `node:fs`,
`node:http`, `node:path` and `vscode`.

## Scripts

| script | what it does |
|---|---|
| `npm run build` | typecheck, then one esbuild bundle to `dist/extension.js` |
| `npm run watch` | the same bundle, rebuilt on change |
| `npm run typecheck` | `tsc --noEmit` alone |
| `npm test` | `tsc -p tsconfig.test.json` (as `pretest`), then `node --test out/test/*.test.js` |
| `npm run package` | remove the previous `.vsix`, then `vsce package` (which runs `vscode:prepublish` → `build`) |
| `npm run install:dev` | package, force-install, and print the installed version |
