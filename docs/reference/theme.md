# Theme mapping

What the extension sends the board when `aboard.theme` is `follow`, and what it
deliberately does not. The argument behind the split is [why the theme splits neutrals
from voices](../explanation/why-the-theme-splits-neutrals-from-voices.md); this page is
the rules.

Under `board`, none of this happens: the extension sends no colours at all and the
board's own `.aboard/theme.json` and dark/light switch decide.

## The three hops

The first hop is the reason there are three.

1. **`media/panel.html` reads** the `--vscode-*` custom properties off its own root and posts the raw values to the extension host. It is the only place they exist: the host API gives `ColorTheme.kind` and no values, and the board's iframe is cross-origin so it inherits none of them.
2. **`src/theme.ts` maps** them onto the board's tokens. It is a pure function with no `vscode` import, which is the whole reason the page hands its values out instead of mapping them itself — `media/panel.html` stays a bridge and learns no palette, and every rule below is reachable from `node --test`.
3. **The page posts `{__aboard: 'theme', kind, tokens}` into the frame**, and the board applies them as inline custom properties for that viewer only. Nothing is written: not the board document, not `localStorage`. Two people can look at one board in the same second and disagree about colour while agreeing about content.

## The 21 tokens

The names live in `src/theme.ts` so that a name the board does not have cannot be
written: the mapping table is keyed by a union derived from this list, so the mistake is
a build that does not finish rather than a colour that silently never arrives.

**Neutrals — these travel.**

| token | source |
|---|---|
| `--bg` | `editor.background` |
| `--sunken` | derived from `--bg` |
| `--surface` | derived from `--bg` |
| `--raised` | derived from `--bg` |
| `--text` | `editor.foreground`, then `foreground` |
| `--muted` | `foreground`, then `editor.foreground` |
| `--dim` | `descriptionForeground`, then `disabledForeground` |
| `--line` | `panel.border`, then `widget.border`, then `editorGroup.border` |
| `--line-strong` | `contrastBorder`, then `widget.border`, then `panel.border` |
| `--edge` | `editorLineNumber.foreground`, then `descriptionForeground` |

**Voices — these never travel.** `--accent`, `--accent-ink`, `--accent-dim`, `--mark`,
`--agent`, `--focus`, `--danger`, `--drop`, `--status-todo`, `--status-doing`,
`--status-done`. They are the board's, in the panel exactly as in a browser tab.
`test/theme.test.ts` pins the split both ways: nothing but a neutral may be sent, and
none of the five mark colours may be.

## The derived depth ramp

`--bg` is the editor's background; the three layers above it are computed from it using
the board's own steps rather than read off VS Code roles.

| kind | `--sunken` | `--surface` | `--raised` |
|---|---|---|---|
| dark | +10 | +21 | +32 |
| light | −8 | −13 | −21 |

The step is applied equally to r, g and b, which is what keeps the editor's tint. If
`--bg` cannot be parsed **the ramp is not sent at all**, and the board keeps its own
complete set of four — the same fail-closed rule the contrast guard follows.

## The contrast guard

The board pins its type to **WCAG AAA (7:1)** because most of it is small; an arbitrary
VS Code theme does not.

`--text`, `--muted` and `--dim` are measured against **every ground the mapping
produced** — `--bg`, `--sunken` and `--surface`, which is the set the board's own rule
names — and if any pair misses AAA, **none of the three is sent**.

- The page ground alone is not the worst of the three, and reading only it lets text through that misses the pin exactly where most of the board's small type sits: on panels and cards. On a theme with an `editor.background` of `#ffffff` and a `sideBar.background` of `#e8e8e8`, an `editor.foreground` of `#545454` is 7.6:1 on the ground and 6.2:1 on `--surface`.
- They travel as a **group** because a hierarchy assembled from two palettes is not a hierarchy — the host's `--text` above the board's `--dim` leaves nobody able to tell which grey is the quiet one — and because the guard has to fail closed when a value cannot be parsed at all.

This fires on VS Code's own **Dark+**, where `descriptionForeground` is about 6.1:1 on
the editor background. That is the honest answer rather than a bug: the backgrounds and
the board's own voices still make the panel belong in the window, and the board keeps the
type it can prove is readable.

Because the ramp is now always present, the guard measures against three grounds rather
than one and so withholds text slightly more often than it used to. It is measuring what
will actually be painted, which is the point.

## Absent colours

A token whose VS Code counterpart is absent is **not sent**, so the board's own value for
it stands — a colour somebody chose against a palette somebody checked, which a guess is
not. `contrastBorder` exists only in high-contrast themes, and a theme missing one colour
must not cost the board a whole palette.

## Theme kind

`kind` is `dark` or `light`, taken from the webview body class. High contrast maps to one
of the two: a high-contrast **light** theme carries both `vscode-high-contrast` and
`vscode-high-contrast-light`, so the specific class is tested first — otherwise every
high-contrast light theme would come up black inside a white editor.

## When it re-reads

Four signals, each catching something the others cannot:

| signal | catches |
|---|---|
| the frame's `load` | a board that reloaded itself has lost the inline properties |
| a `MutationObserver` on the body class | a switch between light and dark |
| a `MutationObserver` on the root's inline `style` | two themes of the same kind differ in their VALUES and in nothing else |
| `window.onDidChangeActiveColorTheme` on the host side | the editor's own notification |

The last two overlap **on purpose**: the host's notice travels theme service → extension
host → renderer → page while the new properties travel theme service → page, and nothing
orders the two. A notice that overtakes them reads the old theme, and the panel would
keep the previous colours until something unrelated moved.

## Who may set the palette

**Only the host.** The board's `html` tabs are frames inside the frame and can reach
`window.top`, so `media/panel.html` refuses a *theme* message whose origin is the string
`null` — which is what an opaque origin serialises to, and what
`sandbox="allow-scripts"` without `allow-same-origin` gives every one of them.

It is checked by origin rather than by `event.source` because what `event.source` is for
a host delivery is an internal of the webview implementation, and a bridge built on that
fails silently on the version that changes it. `goto` deliberately keeps only its
src-prefix pin: when this was decided, navigation had been watched working in a real host
and the theme had not (it has since — 2026-08-26), so a wrong guess about `null` had to
cost a colour rather than a click.

## Drift

The 21 names are a copy of something the aboard repository owns, and like the two hex
values in `src/tokens.ts` they are **checked rather than trusted**:
`test/integration.test.ts` asks the real binary for the list and fails on drift. A name
the board dropped or renamed would otherwise arrive as a warning on the board's own
console, which is not a console anybody working in VS Code is reading. See [duplication
and drift](../explanation/duplication-and-drift.md).

## See also

- [How to make the board match your editor theme](../how-to/match-the-editor-theme.md).
- [Why the theme splits neutrals from voices](../explanation/why-the-theme-splits-neutrals-from-voices.md) — with the measurements from the two mappings that failed.
- `docs/reference/theme.md` in the aboard repository — the tokens' own definitions, roles and contrast measurements.
