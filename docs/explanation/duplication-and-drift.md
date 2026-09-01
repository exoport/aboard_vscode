# Duplication and drift

The rule is **never duplicate without a test that breaks when the copy goes stale.**

It is deliberately not "never duplicate". This repository holds two copies of things the
aboard repository owns, both are load-bearing, and both are held to the rule:

| copy | where | what breaks when it drifts |
|---|---|---|
| the two status-dot colours, `#a7adf4` and `#ff0066` | `src/tokens.ts`, and the two SVGs in `media/` | `test/tokens.test.ts` fails when an SVG drifts from `tokens.ts` |
| the board's 21 token names | `src/theme.ts` | `test/integration.test.ts` asks the real binary for the list and fails on drift |

Writing a hex value into two SVGs and calling a paragraph the single source would have
been a wish.

## Why these two copies exist at all

Neither is laziness; each is forced.

- **A `TreeItem` icon is an image.** There is no way to hand a native tree a colour from a running server, so the dots must be files, and a file must contain a literal.
- **The token names key a TypeScript union.** Having them as a compile-time type is what makes a name the board does not have a *build that does not finish* rather than a colour that silently never arrives. A list fetched at runtime cannot do that.

The second one is worth dwelling on, because the failure it prevents is the usual shape: a
name the board dropped or renamed arrives as a warning on **the board's own console**,
which is not a console anybody working in VS Code is reading.

## And keep the two icon tests apart

They ask different questions:

- **`tokens.test.ts` asks whether the colour is *right*.**
- **`media.test.ts` asks whether there is a colour *at all*.**

Reading a file as text and finding a hex string in it says nothing about whether a browser
will draw it — and for a while it did not, because both SVGs shipped as malformed XML.
Their comments opened `<!-- --agent, copied from … -->`, and XML forbids `--` inside a
comment, so the workbench refused the document outright and the row had no icon. The trap
is that the properties being cited are *spelled* `--agent` and `--danger`: naming the
source accurately is what broke the file.

`media.test.ts` therefore parses, and also **checks that the check can fail** — a test
that cannot be seen failing is a test nobody should trust.

## The same rule, applied to the contract

The whole coupling between the two repositories is [a contract, not a shared
file](what-this-extension-is.md#a-separate-repository-deliberately). That is duplication
too — the route table in [the board contract](../reference/board-contract.md) restates
what `docs/reference/http-api.md` in the aboard repository says — and it is held to the
rule by a different mechanism: `test/integration.test.ts` spawns a **real** `aboard` and
drives `activate()` against it, so the tree refresh, the SSE frame, the debounce, the icon
path, the removal answers and the notify round trip are *executed* rather than reasoned
about.

A prose table can still go stale. What cannot go stale unnoticed is behaviour a test
performs against the real binary.

## The corollary about stand-ins

`test/vscode-stub.ts` must never become a VS Code emulator, and `panel.ts` stays
deliberately uncovered for the same reason: covering it would mean a fake webview, and a
fake webview is a copy of something Microsoft owns with no test that breaks when it goes
stale. The bridge script in `media/panel.html` is reached instead, by running it in
`node:vm`.

See [repository layout](../reference/layout.md#the-two-files-in-test-that-are-not-tests).

## See also

- [Theme mapping](../reference/theme.md#drift).
- [Why a native TreeView](why-a-native-treeview.md) — where the dot colours come from and why they must be files.
