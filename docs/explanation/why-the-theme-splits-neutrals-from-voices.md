# Why the theme splits neutrals from voices

**Follow the editor's neutrals; keep the board's voices.** That is the rule, and it took
two rounds of looking at a real panel to arrive at it. Both failures were built from
**individually valid colours**, which is why nothing warned at either end.

- *Neutrals* — the ground, the three layers above it, the text hierarchy, the hairlines (`--bg`, `--sunken`, `--surface`, `--raised`, `--text`, `--muted`, `--dim`, `--line`, `--line-strong`, `--edge`) — follow the editor. They are what make the panel belong in the window, and they have no meaning to lose.
- *Voices* — `--accent`, `--accent-ink`, `--accent-dim`, `--mark`, `--agent`, `--focus`, `--danger`, `--drop` and the three `--status-*` — are the board's, in the panel exactly as in a browser tab.

**Depth is an ORDER; the voices are a SET**, chosen so no two can be mistaken for one
another. VS Code guarantees neither, because nothing asks a theme author to keep a link
distinguishable from a button, or to order two unrelated background roles.

## The first failure: the depth ramp was borrowed

Until 2026-08-27 the three layers above the ground were read off VS Code roles:
`input.background`, `sideBar.background` and `button.secondaryBackground`. The result did
not survive contact with a real theme.

The board's depth vocabulary runs `bg → sunken → surface → raised`, upward from black in
dark and downward from white in light. VS Code's registered colours have **no ordering
relationship to each other**, because they answer unrelated questions. Measured on FireFly
Pro, which is where the report came from:

| token | old source | value | board's own |
|---|---|---|---|
| `--bg` | `editor.background` | `#0a0f17` | `#000000` |
| `--sunken` | `input.background` | `#000000` | `#0a0a0a` — **below the ground** |
| `--surface` | `sideBar.background` | `#0e1421` | `#151515` |
| `--raised` | `button.secondaryBackground` | `#3a3d41` | `#202020` |

The last row is the loudest. FireFly Pro does not set `button.secondaryBackground` at all,
so **VS Code's default mid grey decided it** — and `.icon-btn` paints with `--raised`,
which made every Edit / Add / Dismiss / Fit button in the panel a light grey pill where a
browser draws it dark. The two head strips went the other way and became recessed boxes.
The panel and a browser tab on the same board did not look like the same product.

Derived from `--bg` instead, the same ground gives `#141921`, `#1f242c`, `#2a2f37`:
correctly ordered, still that theme's blue-black, and the same *relationship* a browser
draws. The step is applied equally to r, g and b, which is what keeps the editor's tint.

One knock-on worth knowing: the contrast guard now measures text against three grounds
that are always present, so it withholds text slightly more often than before. It is
measuring what will actually be painted, which is the point.

## The second failure: the voices were mapped

`views/markup.spec.json` is where it showed. A mark may take one of five colours, drawn as
five swatches side by side. Through the old mapping, on FireFly Pro:

| swatch | mapped from | value | in a browser |
|---|---|---|---|
| `mark` | `editorWarning.foreground` | `#e6b450` amber | `#fb8c00` orange |
| `accent` | `button.background` | `#a4bd00` olive | `#a4bd00` |
| `focus` | `focusBorder` | `#292d36` — near-black, invisible | `#39bae6` cyan |
| `agent` | `textLink.foreground` | `#a4bd00` — **identical to `accent`** | `#a7adf4` periwinkle |
| `danger` | `errorForeground` *(FireFly sets none)* | `#f85149` salmon | `#ff0066` magenta |

**Five choices rendered as three usable colours, one a repeat and one unusable.**

And the board's voices are a language its own docs teach: periwinkle is what an agent
says, orange is what the human asks for, and every agent reads those sentences in the
skill. A panel that repaints them in an editor's colours is not following a theme, it is
discarding a vocabulary — quietly, with nothing on any console.

`test/theme.test.ts` pins the split both ways: nothing but a neutral may be sent, and none
of the five mark colours may be.

## Why an absent colour is left alone

A token whose VS Code counterpart is absent is **not sent**, so the board's own value
stands — a colour somebody chose against a palette somebody checked, which a guess is not.
`contrastBorder` exists only in high-contrast themes, and a theme missing one colour must
not cost the board a whole palette.

The same instinct runs through the whole mapping: when in doubt, send nothing. If `--bg`
cannot be parsed the ramp is not sent at all. If any text pair misses AAA, none of the
three text colours is sent.

## Full fidelity is not the goal, and saying so is part of the design

On VS Code's own **Dark+**, `descriptionForeground` is about 6.1:1 on the editor
background, so the contrast guard withholds the text colours. That is the honest answer
rather than a bug: the backgrounds, and the board's own voices, still make the panel
belong in the window, and the board keeps the type it can prove is readable.

A panel whose text went grey-on-grey would be the guard failing, not the theme arriving.

## What found these, and what did not

Neither failure was caught by a test, because both were made of valid colours: the first
inverted an order, the second collapsed a set. A pure function over real theme values is
now asserted for both — but the thing that found them was a **human looking at the
screen**, which is what every row in [observed in a real
editor](../reference/observed-in-a-real-editor.md) is for.

## See also

- [Theme mapping](../reference/theme.md) — the rules as they now stand.
- [How to make the board match your editor theme](../how-to/match-the-editor-theme.md).
- [The failure mode is silence](the-failure-mode-is-silence.md).
