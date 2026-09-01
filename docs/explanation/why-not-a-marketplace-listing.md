# Why not a marketplace listing

This extension is coupled to a workspace that contains an `aboard` (or `ape aboard`)
project. To a stranger it installs, finds nothing, and does nothing — which is a bad thing
to put in a store people browse.

So: **not the VS Code Marketplace. Deliberate, not an omission.**

The honest description of the audience is "somebody who already runs aboard", and that
person can be handed a `.vsix` or a clone. Nobody is served by making them find it in a
search result, and a listing with a one-star review saying *"empty sidebar"* would be a
fair review.

## Open VSX, if and only if somebody else wants it

That is the next rung and it is not currently being climbed. It needs an Eclipse
Foundation account with the Publisher Agreement signed, a namespace and a token — see
[how to publish a release](../how-to/publish.md) for the commands.

The trigger is somebody outside this pairing asking for it. Until then a GitHub Release
carrying the `.vsix` is the whole distribution story, and it costs nothing to maintain.

## The publisher was decided early anyway

**`exoport`**, matching the Go module path `github.com/exoport/aboard`. It is only a
namespace today — nothing is published anywhere — but it is baked into the `.vsix`
filename and would become the Open VSX namespace later, so it is written down rather than
left to whoever runs `vsce` first.

The display name is **Aboard Panel** and the extension id is `aboard-vscode`. Both are
judgement calls made when the scaffold landed, and both should stay stable now that they
are chosen.

The alternative was leaving the publisher out until publishing day, and `vsce package`
refuses without one — so the trade was "decide it now" against "decide it under time
pressure".

## What would have to be true first

[Edge cases and their status](../reference/edge-cases.md) is the list, and it is titled
for exactly this. The rows that are *coded, unverified* — Remote SSH, Codespaces,
vscode.dev — are the ones a stranger is most likely to hit first and the ones nobody here
can confirm.

## See also

- [How to install it](../how-to/install.md) — what people actually do instead.
- [What this extension is](what-this-extension-is.md) — the coupling that makes this the right call.
