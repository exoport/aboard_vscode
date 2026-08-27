// The VS Code theme, mapped onto the board's own palette.
//
// **Why this file exists.** The board is a dark rectangle by default. Inside a
// light IDE that is not a style choice, it is a hole in the window. `aboard`
// landed the hook for fixing it (its plan-2 item 22): a host that FRAMES the
// board may post `{__aboard: 'theme', kind, tokens}` into it, and the board
// applies those tokens as inline custom properties on its root — per viewer,
// written nowhere, validated against the 21 token names it declares.
//
// **Why the mapping lives on this side of the frame, and in TypeScript.** VS
// Code exposes the live theme as `--vscode-*` custom properties on the WEBVIEW
// document's root, and nowhere else: the extension-host API gives
// `ColorTheme.kind` and no colour values at all, and the board's iframe is
// cross-origin so it inherits none of them. So the values can only be READ in
// `media/panel.html`. They are read there and posted straight back out to the
// host, unmapped — `media/panel.html` stays the bridge it is and learns no
// palette — and every rule worth arguing about is here, where `node --test`
// reaches it and the compiler checks it.
//
// Nothing here imports `vscode`. That is the same line `board.ts`, `model.ts`,
// `sse.ts`, `launch.ts` and `messages.ts` sit on.

/** What VS Code's body class says the theme is. */
export type VscodeThemeKind = 'dark' | 'light' | 'high-contrast' | 'high-contrast-light';

/** What the board has: two variants, and only two. */
export type BoardThemeKind = 'dark' | 'light';

/** The payload of the `{__aboard: 'theme'}` message, minus the envelope key. */
export interface BoardTheme {
  kind: BoardThemeKind;
  tokens: Record<string, string>;
}

/**
 * The board's 21 token names.
 *
 * Copied from `aboard capabilities --format json | jq -r '.theme.tokens[]'`, and
 * — like the two hex values in `tokens.ts` — the copy is CHECKED rather than
 * trusted: `test/integration.test.ts` asks the real binary for the list and fails
 * if this one has drifted. A name the board does not have is dropped on arrival
 * with a console warning nobody in this repo would ever see, which is
 * indistinguishable from the message never arriving.
 */
export const BOARD_TOKENS = [
  '--accent',
  '--accent-dim',
  '--accent-ink',
  '--agent',
  '--bg',
  '--danger',
  '--dim',
  '--drop',
  '--edge',
  '--focus',
  '--line',
  '--line-strong',
  '--mark',
  '--muted',
  '--raised',
  '--status-doing',
  '--status-done',
  '--status-todo',
  '--sunken',
  '--surface',
  '--text',
] as const;

/**
 * One of the board's 21 token names.
 *
 * Derived from the list rather than written twice, and this is the whole reason
 * the list is `as const`: `SOURCES` below is typed by it, so a row naming a
 * token the board does not have is a COMPILE error rather than a colour that
 * silently never arrives. A runtime filter was the other option and is worse —
 * it can only be exercised by code that cannot be written, so it is a guard with
 * no failing case, which is a guard nobody can check.
 */
export type BoardToken = (typeof BOARD_TOKENS)[number];

/**
 * Which VS Code variable each board token comes from, best source first.
 *
 * **The rule that matters is the last line of each list: when none of the
 * candidates is present, the token is left OUT.** The board then keeps its own
 * built-in value for it, which is a colour somebody chose, against a palette
 * somebody checked. A guessed value is neither, and it would look exactly like a
 * deliberate one.
 *
 * The roles on the left are `docs/reference/theme.md` in the aboard repo; the
 * names on the right are VS Code's registered theme colours, which a webview
 * document carries as `--vscode-<section>-<name>` custom properties.
 */
const SOURCES: ReadonlyArray<readonly [BoardToken, readonly string[]]> = [
  // Depth: the page ground, then the three layers above it. The board's
  // sentence is `bg → sunken → surface → raised`, running upward from black in
  // dark and downward from white in light.
  ['--bg', ['--vscode-editor-background']],
  ['--sunken', ['--vscode-input-background', '--vscode-editorWidget-background']],
  ['--surface', ['--vscode-sideBar-background', '--vscode-editorWidget-background', '--vscode-panel-background']],
  ['--raised', ['--vscode-button-secondaryBackground', '--vscode-dropdown-background', '--vscode-editorWidget-background']],

  // The text hierarchy. It travels as a group or not at all — see the contrast
  // guard below.
  ['--text', ['--vscode-editor-foreground', '--vscode-foreground']],
  ['--muted', ['--vscode-foreground', '--vscode-editor-foreground']],
  ['--dim', ['--vscode-descriptionForeground', '--vscode-disabledForeground']],

  // Structure. `contrastBorder` is only defined by high-contrast themes, which
  // is exactly where a border that has to be seen matters most.
  ['--line', ['--vscode-panel-border', '--vscode-widget-border', '--vscode-editorGroup-border']],
  ['--line-strong', ['--vscode-contrastBorder', '--vscode-widget-border', '--vscode-panel-border']],
  ['--edge', ['--vscode-editorLineNumber-foreground', '--vscode-descriptionForeground']],

  // The one accent. The board's role for `--accent` is literally "the primary
  // button", so `button.background` leads and `focusBorder` is the fallback —
  // the brief named them the other way round and the role decides it.
  ['--accent', ['--vscode-button-background', '--vscode-focusBorder']],
  ['--accent-ink', ['--vscode-button-foreground']],
  ['--accent-dim', ['--vscode-focusBorder', '--vscode-button-background']],

  // The three voices: the human asking for something, an agent saying
  // something, and a link or focus ring.
  ['--mark', ['--vscode-editorWarning-foreground', '--vscode-notificationsWarningIcon-foreground', '--vscode-charts-orange']],
  ['--agent', ['--vscode-textLink-foreground', '--vscode-charts-purple']],
  ['--focus', ['--vscode-focusBorder', '--vscode-textLink-foreground']],
  ['--danger', ['--vscode-errorForeground', '--vscode-editorError-foreground', '--vscode-charts-red']],
  ['--drop', ['--vscode-list-dropBackground', '--vscode-editor-selectionBackground']],

  // Status. The board declares `--status-doing` to BE the accent and
  // `--status-done` to be `--line-strong` in both variants, so they are given
  // the same sources rather than a second mechanism for saying "the same as".
  ['--status-todo', ['--vscode-charts-lines', '--vscode-disabledForeground', '--vscode-descriptionForeground']],
  ['--status-doing', ['--vscode-button-background', '--vscode-focusBorder']],
  ['--status-done', ['--vscode-contrastBorder', '--vscode-widget-border', '--vscode-panel-border']],
];

/**
 * Every `--vscode-*` name the mapping can read, deduplicated.
 *
 * `media/panel.html` is handed this list at render time (`src/panel.ts`
 * substitutes it) and reads exactly these off the webview root. So the page has
 * one fewer thing that can drift: the names live here, beside the mapping that
 * uses them, and a source added below reaches the page on the next render.
 *
 * Enumerating the root's custom properties instead was rejected: whether
 * `getComputedStyle` iterates custom properties depends on the Chromium behind
 * this window's Electron, and a feature that works on one VS Code build and
 * silently reads nothing on another is worse than a list.
 */
export const VSCODE_VARS: readonly string[] = [...new Set(SOURCES.flatMap(([, names]) => names))].sort();

/**
 * The same value grammar the board itself accepts, from `aboard.html`.
 *
 * A hex colour, a CSS colour keyword, or a function call of numbers and
 * separators. Values that fail it are dropped HERE rather than sent and dropped
 * there, because a warning on the board's console is a warning nobody looking at
 * VS Code will ever read.
 */
const VALUE = /^(#[0-9A-Fa-f]{3,8}|[A-Za-z][A-Za-z0-9-]{0,31}|[a-z-]{1,20}\([A-Za-z0-9 ,./%+-]{0,100}\))$/;

/** The three tokens the contrast guard governs, in hierarchy order. */
const TEXT_TOKENS = ['--text', '--muted', '--dim'] as const;

/**
 * The grounds the board's contrast rule names, worst case first in practice.
 *
 * `docs/reference/theme.md`: "Text is pinned to WCAG AAA (>=7:1) on the page
 * ground, `--sunken` and `--surface`" — three grounds, not one. `--bg` alone is
 * NOT the worst of them and measuring only against it lets text through that
 * misses the pin exactly where most of the board's small type sits: on panels
 * and cards. Measured, on a light theme with `editor.background` `#ffffff` and
 * `sideBar.background` `#e8e8e8`, an `editor.foreground` of `#545454` is 7.6:1
 * on the ground and 6.2:1 on `--surface`.
 *
 * `--raised` is deliberately absent: the board's own table puts it outside the
 * pin, because it is the ground under a button where the text is a label rather
 * than prose.
 */
const GROUND_TOKENS = ['--bg', '--sunken', '--surface'] as const;

/**
 * WCAG AAA, which is what the board pins its text to.
 *
 * The number is `docs/reference/theme.md`'s, not one invented here: "Text is
 * pinned to WCAG AAA (≥7:1) on the page ground, `--sunken` and `--surface`,
 * because most type on this board is small."
 */
export const AAA = 7;

/* ------------------------------------------------------------- colour maths */

interface Rgb {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parse the colour forms VS Code actually puts in these variables: `#rgb`,
 * `#rgba`, `#rrggbb`, `#rrggbbaa`, and `rgb()`/`rgba()` in either the legacy
 * comma syntax or the modern space syntax with a `/ alpha`.
 *
 * Anything else — a keyword, `color-mix()`, a value that is not a colour at all
 * — returns undefined, and the caller treats that as "cannot prove it is
 * readable". Failing closed is the whole point of the guard.
 */
export function parseColor(value: string): Rgb | undefined {
  const text = value.trim();
  const hex = /^#([0-9a-fA-F]{3,8})$/.exec(text);
  if (hex) {
    const digits = hex[1]!;
    const expand = (s: string) => parseInt(s.length === 1 ? s + s : s, 16);
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: expand(digits[0]!),
        g: expand(digits[1]!),
        b: expand(digits[2]!),
        a: digits.length === 4 ? expand(digits[3]!) / 255 : 1,
      };
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: expand(digits.slice(0, 2)),
        g: expand(digits.slice(2, 4)),
        b: expand(digits.slice(4, 6)),
        a: digits.length === 8 ? expand(digits.slice(6, 8)) / 255 : 1,
      };
    }
    return undefined;
  }
  const fn = /^rgba?\(([^)]*)\)$/i.exec(text);
  if (!fn) {
    return undefined;
  }
  const parts = fn[1]!
    .replace(/\//g, ' ')
    .split(/[\s,]+/)
    .filter((p) => p !== '');
  if (parts.length < 3 || parts.length > 4) {
    return undefined;
  }
  const channel = (raw: string): number | undefined => {
    const pct = raw.endsWith('%');
    const n = Number.parseFloat(pct ? raw.slice(0, -1) : raw);
    if (!Number.isFinite(n)) {
      return undefined;
    }
    return Math.min(255, Math.max(0, pct ? (n / 100) * 255 : n));
  };
  const [r, g, b] = [channel(parts[0]!), channel(parts[1]!), channel(parts[2]!)];
  if (r === undefined || g === undefined || b === undefined) {
    return undefined;
  }
  let a = 1;
  if (parts.length === 4) {
    const raw = parts[3]!;
    const n = Number.parseFloat(raw.endsWith('%') ? raw.slice(0, -1) : raw);
    if (!Number.isFinite(n)) {
      return undefined;
    }
    a = Math.min(1, Math.max(0, raw.endsWith('%') ? n / 100 : n));
  }
  return { r, g, b, a };
}

function luminance({ r, g, b }: Rgb): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** `ink` composited over `ground`, so a semi-transparent foreground is judged as it will look. */
function over(ink: Rgb, ground: Rgb): Rgb {
  const mix = (a: number, b: number) => a * ink.a + b * (1 - ink.a);
  return { r: mix(ink.r, ground.r), g: mix(ink.g, ground.g), b: mix(ink.b, ground.b), a: 1 };
}

/**
 * The WCAG contrast ratio of `ink` on `ground`, or undefined when either is not
 * a colour this file can read.
 */
export function contrast(ink: string, ground: string): number | undefined {
  const fg = parseColor(ink);
  const bg = parseColor(ground);
  if (!fg || !bg) {
    return undefined;
  }
  const a = luminance(over(fg, bg));
  const b = luminance(bg);
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/* ------------------------------------------------------------- the mapping */

/**
 * Which board variant a VS Code theme is.
 *
 * High contrast is not a third variant on the board, and inventing one would be
 * a renderer change in a repo that owns no rendering. It is dark or light like
 * anything else, told apart by which class VS Code put on the body: a
 * high-contrast LIGHT theme carries both `vscode-high-contrast` and
 * `vscode-high-contrast-light`, so the more specific one has to be tested first
 * or every HC light theme reads as dark.
 */
export function themeKindFromBodyClass(bodyClass: string): VscodeThemeKind {
  const classes = bodyClass.split(/\s+/);
  if (classes.includes('vscode-high-contrast-light')) {
    return 'high-contrast-light';
  }
  if (classes.includes('vscode-high-contrast')) {
    return 'high-contrast';
  }
  if (classes.includes('vscode-light')) {
    return 'light';
  }
  return 'dark';
}

export function boardKind(kind: VscodeThemeKind): BoardThemeKind {
  return kind === 'light' || kind === 'high-contrast-light' ? 'light' : 'dark';
}

/**
 * The VS Code theme, as the board's palette.
 *
 * Four refusals, and each one is the point of the function:
 *
 *  1. **A token whose sources are all absent is left out**, so the board's own
 *     value stands. Absent is the ordinary case — `contrastBorder` exists only
 *     in high-contrast themes, `charts.*` only since it was registered — and a
 *     theme that is missing one colour must not lose a whole palette to it.
 *  2. **A value the board would refuse is dropped here.** The board validates
 *     what arrives and warns on its own console; nobody working in VS Code is
 *     looking at that console.
 *  3. **A name the board does not declare cannot be sent**, for the same
 *     reason: it would be dropped there, on that console. That one is the
 *     compiler's — `SOURCES` is keyed by `BoardToken`, so the mistake is not a
 *     refusal at run time, it is a build that does not finish.
 *  4. **The text hierarchy is guarded.** The board pins text to AAA (≥7:1);
 *     an arbitrary VS Code theme does not, and several shipped ones put
 *     `descriptionForeground` around 4.5:1 on the editor background. So all
 *     three text tokens are measured against every ground the mapping produced
 *     — `--bg`, `--sunken` and `--surface`, which is the set the board's own
 *     rule names — and if any pair misses AAA, none of the three is sent: the
 *     backgrounds still arrive, so the board still belongs in the window, and
 *     the type stays readable. They travel as a group because a hierarchy
 *     assembled from two palettes — the host's `--text` above the board's
 *     `--dim` — is not a hierarchy, and because the guard has to fail closed
 *     when a value cannot be parsed at all.
 */
export function mapVscodeTheme(vars: Record<string, string>, kind: VscodeThemeKind): BoardTheme {
  const tokens: Record<string, string> = {};
  for (const [token, candidates] of SOURCES) {
    for (const name of candidates) {
      const raw = vars[name];
      if (typeof raw !== 'string') {
        continue;
      }
      const value = raw.trim();
      if (value === '' || !VALUE.test(value)) {
        continue;
      }
      tokens[token] = value;
      break;
    }
  }

  // Every ground the mapping actually produced, not just the page ground. A
  // ground the board keeps its OWN value for is not measured against, because
  // the board's own palette already clears its own pin — the question here is
  // only whether the colours being SENT hold together.
  const grounds = GROUND_TOKENS.map((token) => tokens[token]).filter((v): v is string => v !== undefined);
  const readable =
    // `--bg` specifically must be there: with no page ground there is nothing to
    // measure against at all, and sending text colours anyway would be trading
    // readability for fidelity on a guess.
    tokens['--bg'] !== undefined &&
    TEXT_TOKENS.every((token) => {
      const ink = tokens[token];
      if (ink === undefined) {
        // Absent is not unreadable: the board's own value for it stands, and
        // the ones that DID resolve are still measured.
        return true;
      }
      // `every` over the grounds, so a value neither this file nor the board can
      // parse fails closed rather than being skipped.
      return grounds.every((ground) => {
        const ratio = contrast(ink, ground);
        return ratio !== undefined && ratio >= AAA;
      });
    });
  if (!readable) {
    for (const token of TEXT_TOKENS) {
      delete tokens[token];
    }
  }

  return { kind: boardKind(kind), tokens };
}
