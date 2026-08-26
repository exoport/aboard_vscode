// The ONE place this extension duplicates a value from the aboard repo.
//
// A native TreeView cannot be given a colour from the board's palette: VS Code
// themes its own icons, so the two status dots ship as SVGs carrying these hex
// values literally. Both are copied from `pkg/aboard/web/app.css` in the aboard
// repo (`--agent`, `--danger`). `--agent` was called `--claude` on the spike and
// was renamed on 2026-08-24 with no alias kept; there is no `--claude` to
// reference anywhere.
//
// The SVGs cannot import this file, so the agreement is asserted instead:
// test/tokens.test.ts reads both SVGs and fails if either drifts from the value
// below. That is what makes "the values live in one place" true rather than a
// wish.
export const TOKENS = {
  /** --agent: a tab an agent touched. */
  agent: '#a7adf4',
  /** --danger: a tab an agent has asked to remove. */
  danger: '#ff0066',
} as const;
