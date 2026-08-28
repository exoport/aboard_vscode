// `media/panel.html`'s script, run.
//
// The page is the only place the editor's colours can be read, and it is the only
// place the board can be told about them — so the whole theme feature dies here if
// this script is wrong, silently and with nothing on any console. It is also the
// one file in this repo that no other test executes: `src/panel.ts` is deliberately
// uncovered (a fake webview is where a stand-in becomes an emulator), and the page
// it renders was, until now, uncovered with it.
//
// So the script is lifted out of the HTML and run in `node:vm` against a stub
// `window` — not a DOM, just the handful of objects the ~40 lines actually touch.
// That is the same posture as `test/vscode-stub.ts`: model the contract, not the
// platform. What it cannot show is that VS Code really defines `--vscode-*` on the
// webview root or that a cross-origin `contentWindow.postMessage` arrives; those
// are the host's job and the board's, and both are asserted on the aboard side.
//
// The substitution matters as much as the script: `src/panel.ts` replaces
// `__VARS__` with `VSCODE_VARS`, so this test does the same replacement and would
// fail if the placeholder were renamed on one side only.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, it } from 'node:test';
import * as vm from 'node:vm';

import { VSCODE_VARS } from '../src/theme';

const PAGE = path.join(__dirname, '..', '..', 'media', 'panel.html');
const SRC = 'http://127.0.0.1:46624/?chrome=notabs';
const SRC_ORIGIN = 'http://127.0.0.1:46624';

interface FramePost {
  data: Record<string, unknown>;
  origin: string;
}

interface Page {
  /** Everything `vscode.postMessage` was given, newest last. */
  toHost: Array<Record<string, unknown>>;
  /** Everything posted into the board's frame. */
  toFrame: FramePost[];
  /** The frame's current `src`. */
  src(): string;
  /** A message from the extension host. */
  fromHost(data: unknown): void;
  /** A message from the board, authenticated by source window. */
  fromBoard(data: unknown): void;
  /** The frame finished loading a document. */
  load(): void;
  /** VS Code rewrote the body class — a switch between light and dark. */
  restyle(bodyClass: string): void;
  /**
   * VS Code rewrote the `--vscode-*` properties on the root and left the body
   * class alone — a switch between two themes of the same kind.
   */
  recolor(vars: Record<string, string>): void;
  /**
   * A message from a frame INSIDE the board's frame: an `html` tab, sandboxed
   * with `allow-scripts` and no `allow-same-origin`, posting to `window.top`.
   * Its opaque origin serialises to the string "null".
   */
  fromNested(data: unknown): void;
}

function runPage(vars: Record<string, string>, bodyClass = 'vscode-dark'): Page {
  const html = fs.readFileSync(PAGE, 'utf8');
  const found = /<script nonce="__NONCE__">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(found, 'media/panel.html has no bridge script with a __NONCE__ placeholder');
  const source = found[1]!.replace('__VARS__', JSON.stringify(VSCODE_VARS));
  assert.ok(!source.includes('__VARS__'), 'the __VARS__ placeholder was not substituted');

  const toHost: Array<Record<string, unknown>> = [];
  const toFrame: FramePost[] = [];
  const messageListeners: Array<(e: unknown) => void> = [];
  const loadListeners: Array<() => void> = [];
  // Keyed by the node observed, because the page now watches two of them for two
  // different halves of a theme change and firing both from one helper would
  // hide either going missing.
  const observers = new Map<unknown, Array<() => void>>();
  const body = { className: bodyClass };
  const documentElement = {};
  const read = { ...vars };

  const contentWindow = {
    postMessage: (data: Record<string, unknown>, origin: string) => toFrame.push({ data, origin }),
  };
  const frame = {
    src: SRC,
    contentWindow,
    getAttribute(name: string): string | null {
      return name === 'src' ? SRC : null;
    },
    addEventListener(type: string, fn: () => void): void {
      if (type === 'load') {
        loadListeners.push(fn);
      }
    },
  };

  const context = {
    acquireVsCodeApi: () => ({ postMessage: (m: Record<string, unknown>) => toHost.push(m) }),
    document: {
      getElementById: (id: string) => (id === 'frame' ? frame : null),
      documentElement,
      body,
    },
    getComputedStyle: () => ({ getPropertyValue: (name: string) => read[name] ?? '' }),
    MutationObserver: class {
      constructor(private readonly fn: () => void) {}
      observe(target: unknown): void {
        const list = observers.get(target) ?? [];
        list.push(() => this.fn());
        observers.set(target, list);
      }
    },
    window: {
      addEventListener(type: string, fn: (e: unknown) => void): void {
        if (type === 'message') {
          messageListeners.push(fn);
        }
      },
    },
    console,
  };
  vm.createContext(context);
  vm.runInContext(source, context);

  const deliver = (source_: unknown, origin: string, data: unknown) => {
    for (const fn of [...messageListeners]) {
      fn({ source: source_, origin, data });
    }
  };
  const fire = (target: unknown) => {
    for (const fn of [...(observers.get(target) ?? [])]) {
      fn();
    }
  };
  return {
    toHost,
    toFrame,
    src: () => frame.src,
    // `vscode-webview://<uuid>` is what a real host delivery carries; the uuid
    // is not knowable in advance, which is why the page never checks for a
    // value and only refuses the one origin that cannot be a host.
    fromHost: (data) => deliver({ notTheFrame: true }, 'vscode-webview://0e1f', data),
    fromBoard: (data) => deliver(contentWindow, SRC_ORIGIN, data),
    fromNested: (data) => deliver({ anHtmlTab: true }, 'null', data),
    load: () => {
      for (const fn of [...loadListeners]) {
        fn();
      }
    },
    restyle: (className) => {
      body.className = className;
      fire(body);
    },
    recolor: (next) => {
      Object.assign(read, next);
      fire(documentElement);
    },
  };
}

/**
 * Cross the realm boundary before comparing.
 *
 * An object literal built inside `vm.runInContext` has that context's
 * `Object.prototype`, so `assert.deepEqual` — which is deepSTRICTEqual under
 * `node:assert/strict` — refuses it as "same structure, not reference-equal"
 * while pointing at two identical printouts. Serialising is what the real
 * boundary does anyway: a `postMessage` payload is structured-cloned.
 */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const themed = (page: Page) => page.toFrame.filter((p) => p.data['__aboard'] === 'theme');
const reports = (page: Page) => page.toHost.filter((m) => m['type'] === 'theme');

describe('the panel page', () => {
  it('reports the editor’s variables to the host as soon as it runs', () => {
    const page = runPage({ '--vscode-editor-background': '#1f1f1f' }, 'vscode-high-contrast');
    assert.equal(reports(page).length, 1);
    const report = reports(page)[0]!;
    assert.equal(report['bodyClass'], 'vscode-high-contrast');
    const read = report['vars'] as Record<string, string>;
    // Every name it was told to read, present or not: `''` is what
    // getPropertyValue answers for a variable this window does not have, and
    // `parseWebviewMessage` is where those are dropped.
    assert.deepEqual(Object.keys(read).sort(), [...VSCODE_VARS].sort());
    assert.equal(read['--vscode-editor-background'], '#1f1f1f');
    // A name it reads and this window does not define. `--vscode-focusBorder`
    // used to be the example; it is no longer read at all, because `--focus` is
    // a voice the board keeps (see SOURCES).
    assert.equal(read['--vscode-widget-border'], '');
    // And it still says it is ready, which is what unblocks the first `goto`.
    assert.ok(page.toHost.some((m) => m['type'] === 'ready'));
  });

  it('holds the theme until the frame has loaded, then posts it', () => {
    const page = runPage({ '--vscode-editor-background': '#1f1f1f' });
    page.fromHost({ type: 'theme', kind: 'light', tokens: { '--bg': '#ffffff' } });
    // Nothing to tell yet: a message posted at a frame with no document in it is
    // simply lost, and this is the ordinary order — the page reports, the host
    // maps and answers, and the frame is still fetching the board.
    assert.equal(themed(page).length, 0);

    page.load();
    assert.equal(themed(page).length, 1);
    assert.deepEqual(plain(themed(page)[0]!.data), {
      __aboard: 'theme',
      kind: 'light',
      tokens: { '--bg': '#ffffff' },
    });
    // `'*'` because a webview's `vscode-webview://<uuid>` origin is not knowable
    // in advance; the board authenticates the SOURCE instead.
    assert.equal(themed(page)[0]!.origin, '*');
  });

  it('posts it again on every load, because a reloaded board has lost it', () => {
    // The board reloads itself when its own code changes (its reload mechanism,
    // ported from the spike). The tokens live as inline custom properties on a
    // document that no longer exists, and nothing tells this page that except
    // the next `load`.
    const page = runPage({});
    page.load();
    page.fromHost({ type: 'theme', kind: 'dark', tokens: { '--bg': '#101010' } });
    assert.equal(themed(page).length, 1);
    page.load();
    assert.equal(themed(page).length, 2);
    assert.deepEqual(plain(themed(page)[1]!.data['tokens']), { '--bg': '#101010' });
  });

  it('re-reads when the host asks, and when the body class changes', () => {
    const page = runPage({ '--vscode-editor-background': '#1f1f1f' });
    assert.equal(reports(page).length, 1);

    // `onDidChangeActiveColorTheme` on the host side. Two dark themes differ in
    // their VALUES and not in the body class, so this is the only notice either
    // side gets for that case.
    page.fromHost({ type: 'theme-probe' });
    assert.equal(reports(page).length, 2);

    page.restyle('vscode-light');
    assert.equal(reports(page).length, 3);
    assert.equal(reports(page)[2]!['bodyClass'], 'vscode-light');
  });

  it('re-reads when only the VALUES move, without waiting for the host to say so', () => {
    // Two themes of the same kind differ in their `--vscode-*` properties and in
    // nothing else: the body class does not move. `theme-probe` covers that, but
    // it travels theme service -> extension host -> renderer -> here while the
    // new properties travel theme service -> here, and nothing orders the two —
    // a probe that overtakes them reads the OLD theme and the panel keeps the
    // previous colours until something unrelated moves. Watching the root's
    // inline style is the signal that cannot arrive early.
    const page = runPage({ '--vscode-editor-background': '#1f1f1f' });
    assert.equal(reports(page).length, 1);

    page.recolor({ '--vscode-editor-background': '#24273a' });
    assert.equal(reports(page).length, 2);
    const read = reports(page)[1]!['vars'] as Record<string, string>;
    assert.equal(read['--vscode-editor-background'], '#24273a');
    // And the body class is untouched, which is the whole point of this case.
    assert.equal(reports(page)[1]!['bodyClass'], 'vscode-dark');
  });

  it('refuses a theme from a frame inside the board’s frame', () => {
    // The board's `html` tabs are sandboxed with `allow-scripts` and no
    // `allow-same-origin`, so they can reach `window.top` — this page — and
    // their opaque origin serialises to the string "null". `e.source` is neither
    // the board nor the host there, so before this guard an agent-authored
    // widget could set the panel's palette and flip its light/dark variant. The
    // `goto` branch has always been pinned by its src prefix; the theme branches
    // needed a rule of their own.
    const page = runPage({});
    page.fromNested({ type: 'theme', kind: 'light', tokens: { '--bg': '#ffffff' } });
    page.load();
    assert.equal(themed(page).length, 0);

    // And it cannot make the page re-read either — a report is cheap, but a
    // grandchild that can drive one can drive them without end.
    const before = reports(page).length;
    page.fromNested({ type: 'theme-probe' });
    assert.equal(reports(page).length, before);

    // `goto` is deliberately NOT behind this guard: navigation has been watched
    // working in a real host and the theme has not, so an origin string this
    // page turns out to be wrong about must cost a colour and never a sidebar
    // click. The src-prefix pin is what confines the same grandchild there, and
    // it still does.
    page.fromNested({ type: 'goto', src: 'http://evil.example/#tab=bb1&r=9' });
    assert.equal(page.src(), SRC);

    // The host still gets through on the same page.
    page.fromHost({ type: 'theme', kind: 'dark', tokens: { '--bg': '#101010' } });
    assert.equal(themed(page).length, 1);
  });

  it('forwards the sidebar’s New Tab into the board, and only from the host', () => {
    // The `+` moved to the view title on 2026-08-27, so this hop is the whole of
    // it: the host says `newtab`, the page turns it into the board's own
    // `{__aboard:'newtab'}`, and the BOARD opens the sheet it owns. Nothing
    // about types or empty states passes through here, which is the point.
    const page = runPage({});
    page.load();
    const before = page.toFrame.length;

    page.fromHost({ type: 'newtab' });
    const sent = page.toFrame.slice(before);
    assert.equal(sent.length, 1, 'the host’s newtab did not reach the board');
    // Field by field: the object was built inside the `vm` context, so its
    // prototype is that realm's and deepStrictEqual refuses it on identity
    // alone. The keys are the assertion that matters — nothing about types or
    // names may ride along on this message.
    assert.deepEqual(Object.keys(sent[0]!.data), ['__aboard']);
    assert.equal(sent[0]!.data['__aboard'], 'newtab');

    // Guarded like the theme branches, and this one draws a MODAL: an
    // agent-authored `html` widget reaching `window.top` must not be able to pop
    // the new-tab sheet over the human's board.
    page.fromNested({ type: 'newtab' });
    assert.equal(page.toFrame.length, before + 1, 'a nested frame opened the new-tab sheet');

    // And the board itself cannot ask this page to ask the board — a loop with
    // nothing at the end of it but a modal.
    page.fromBoard({ type: 'newtab' });
    assert.equal(page.toFrame.length, before + 1, 'the board’s own message came back at it');
  });

  it('takes a theme from the host and not from the board', () => {
    // The frame is cross-origin by design, so the sender is authenticated by
    // source window. A board that posted its own palette back at this page would
    // otherwise be able to set the colours the host is meant to own.
    const page = runPage({});
    page.fromHost({ type: 'theme', kind: 'dark', tokens: { '--bg': '#101010' } });
    page.fromBoard({ type: 'theme', kind: 'light', tokens: { '--bg': '#ffffff' } });
    page.load();
    assert.equal(themed(page).length, 1);
    assert.deepEqual(plain(themed(page)[0]!.data['tokens']), { '--bg': '#101010' });
  });

  it('carries a clipboard request out to the host and the answer back in', () => {
    // The hop that exists because a webview cannot write an image to the
    // clipboard and the extension host can. This page learns nothing about
    // images on the way through — it forwards a shape and forwards a shape back.
    const page = runPage({});
    page.load();
    const before = page.toHost.length;

    page.fromBoard({ __aboard: 'clipboard-image', id: 7, dataUrl: 'data:image/png;base64,AAAA' });
    const sent = page.toHost.slice(before).filter((m) => m['type'] === 'clipboard-image');
    assert.equal(sent.length, 1, 'the board’s clipboard request did not reach the host');
    assert.equal(sent[0]!['id'], 7);
    assert.equal(sent[0]!['dataUrl'], 'data:image/png;base64,AAAA');

    const framed = page.toFrame.length;
    page.fromHost({ type: 'clipboard-result', id: 7, ok: true, tool: 'xclip' });
    const back = page.toFrame.slice(framed);
    assert.equal(back.length, 1, 'the host’s answer did not reach the board');
    assert.equal(back[0]!.data['__aboard'], 'clipboard-result');
    assert.equal(back[0]!.data['id'], 7);
    assert.equal(back[0]!.data['ok'], true);

    // Guarded like every other host branch: an html tab inside the board reaches
    // window.top, and must not be able to tell the board that a copy it never
    // made succeeded.
    const after = page.toFrame.length;
    page.fromNested({ type: 'clipboard-result', id: 7, ok: true });
    assert.equal(page.toFrame.length, after, 'a nested frame forged a clipboard result');
  });

  it('tells the board what this host can do, on every load', () => {
    const page = runPage({ '--vscode-editor-background': '#1f1f1f' });
    const announced = () => page.toFrame.filter((p) => p.data['__aboard'] === 'host');

    // Nothing before the frame has a document in it: a message posted at one is
    // simply lost, which is the same reason `paint` holds the theme back.
    assert.equal(announced().length, 0, 'the page announced into a frame with nothing in it');

    page.load();
    assert.equal(announced().length, 1, 'the board was never told what its host can do');
    assert.deepEqual(plain(announced()[0]!.data), {
      __aboard: 'host',
      name: 'vscode',
      clipboard: true,
    });

    // And again on the next load. The board reloads itself when its own code
    // changes, and a reloaded document has been told nothing — which is
    // indistinguishable, from the board's side, from a host too old to say.
    page.load();
    assert.equal(announced().length, 2, 'a reloaded board was left thinking it had no host');
  });

  it('delegates clipboard-write to the board frame', () => {
    // The board's markup renderer copies a cropped image region to the
    // clipboard. In here the board is a cross-origin frame, so the permission
    // has to be delegated by `allow` or the write is refused — and a copy button
    // that silently does nothing is the exact shape of every defect this
    // extension has shipped. Asserted as page source because no stub can tell
    // whether a real webview honours it.
    const html = fs.readFileSync(PAGE, 'utf8');
    assert.match(html, /<iframe[^>]*\ballow="[^"]*clipboard-write/, 'the board frame cannot reach the clipboard');
  });

  it('has every placeholder substituted by src/panel.ts, and no others', () => {
    // The page is a template, and an unsubstituted `__VARS__` is not a missing
    // colour — it is a SyntaxError in the only script on the page, which takes
    // `goto` and `active` down with it and shows a blank panel. Nothing else
    // here would notice: this test does its own substitution, and `src/panel.ts`
    // is the file with no runtime cover.
    const html = fs.readFileSync(PAGE, 'utf8');
    const wanted = [...new Set(html.match(/__[A-Z]+__/g) ?? [])].sort();
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'panel.ts'), 'utf8');
    const replaced = [...new Set((source.match(/\.replace\('(__[A-Z]+__)'/g) ?? []).map((m) => m.slice(10, -1)))].sort();
    assert.deepEqual(replaced, wanted);
  });

  it('still does the two things it did before', () => {
    const page = runPage({});
    // The board announcing its own tab switch, forwarded to the host.
    page.fromBoard({ __aboard: 'active', tab: 'bb13' });
    assert.deepEqual(plain(page.toHost.filter((m) => m['type'] === 'active')), [{ type: 'active', tab: 'bb13' }]);
    // A goto from the host, pinned to the src the frame was rendered with.
    page.fromHost({ type: 'goto', src: `${SRC}#tab=bb13&r=1` });
    assert.equal(page.src(), `${SRC}#tab=bb13&r=1`);
    page.fromHost({ type: 'goto', src: 'http://evil.example/#tab=bb13&r=2' });
    assert.equal(page.src(), `${SRC}#tab=bb13&r=1`);
  });
});
