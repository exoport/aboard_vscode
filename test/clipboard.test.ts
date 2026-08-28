// Putting a PNG on the system clipboard by asking a program to do it.
//
// This is the extension's only platform-specific code and its only dependency on
// a binary outside VS Code, so it is the file with the most to get wrong quietly:
// a decode that accepts anything, a temp file left behind, a missing tool
// reported as a mystery. Each of those is a case below.
//
// What is NOT covered here is xclip actually working — that needs an X session
// and a human to press Ctrl+V, and it is a row on the verification list. What is
// covered is everything up to the spawn, and every way the spawn can fail.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { describe, it } from 'node:test';

import { CLIPBOARD_TOOLS, copyImageToClipboard, decodePng, missingToolMessage, TOOL_TIMEOUT_MS } from '../src/clipboard';

/** The smallest real PNG: an 8-byte signature is all decodePng inspects. */
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);
const DATA_URL = 'data:image/png;base64,' + PNG.toString('base64');

/**
 * Stand-ins for xclip, so a unit test never writes to the machine's clipboard.
 *
 * `node` is used as the program because it is certainly present, and the
 * successful one DAEMONISES exactly as xclip does: it spawns a child that
 * inherits stderr and outlives it, then exits 0 immediately. That is the whole
 * hazard, reproduced without an X server — a `close`-based implementation waits
 * for the inherited pipe and never finishes.
 *
 * The first version of these tests called the real xclip. Running `npm test`
 * therefore replaced whatever the developer had on their clipboard with this
 * file's fake PNG, and on 2026-08-28 the human pasted it into their board and
 * reported an image that would not load. It was mine.
 */
// `detached` + `unref` + an explicit exit, because without all three the
// stand-in does not reproduce xclip: Node keeps its event loop alive for a
// running child, so the PARENT would wait for it and the copy would look slow
// for the ordinary reason instead of the interesting one. Measured while writing
// this — the first version took 3123ms and the assertion caught it, which is the
// test proving it can tell the two apart.
//
// fd 2 is passed to the grandchild deliberately: that is the inherited stderr
// pipe whose staying open is the entire hazard.
const FORKS = 'const {spawn}=require("child_process");'
  + 'const c=spawn(process.execPath,["-e","setTimeout(()=>{},3000)"],{stdio:["ignore","ignore",2],detached:true});'
  + 'c.unref();process.exit(0);';
const STANDIN: typeof CLIPBOARD_TOOLS = [
  { cmd: process.execPath, stdin: false, args: () => ['-e', FORKS] },
];
const MISSING: typeof CLIPBOARD_TOOLS = [
  { cmd: 'aboard-no-such-clipboard-tool', stdin: false, args: () => [] },
];

describe('decodePng', () => {
  it('reads the data URL the board sends', () => {
    const out = decodePng(DATA_URL);
    assert.ok(out);
    assert.deepEqual([...out.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  });

  it('refuses anything that is not a PNG data URL', () => {
    // Each of these is something a page could send, deliberately or by accident,
    // and every one of them is about to be written to disk and handed to another
    // program if it gets through.
    assert.equal(decodePng(undefined), undefined);
    assert.equal(decodePng(42), undefined);
    assert.equal(decodePng('data:image/svg+xml;base64,PHN2Zy8+'), undefined, 'an SVG is not a PNG');
    assert.equal(decodePng('data:text/html;base64,PGI+'), undefined);
    assert.equal(decodePng('https://example.com/a.png'), undefined, 'a URL is not a payload');
    // The right envelope around the wrong bytes: this is the case a prefix check
    // alone would pass, which is why the signature is checked too.
    assert.equal(
      decodePng('data:image/png;base64,' + Buffer.from('<html>not a png</html>').toString('base64')),
      undefined,
    );
  });

  it('refuses one too large to be worth moving', () => {
    // Bounded on the ENCODED length, before decoding — checking after would mean
    // allocating the thing the limit exists to prevent.
    const huge = 'data:image/png;base64,' + 'A'.repeat(40 * 1024 * 1024);
    assert.equal(decodePng(huge), undefined);
  });
});

describe('copyImageToClipboard', () => {
  it('says what to install when no tool is there', async () => {
    const out = await copyImageToClipboard(DATA_URL, { platform: 'linux', tools: MISSING });
    assert.equal(out.ok, false);
    assert.match(out.error ?? '', /xclip/, 'a Linux failure has to name the program to install');
    assert.match(out.error ?? '', /install/i);
  });

  it('reports a tool that is present and refuses, as itself', async () => {
    // Distinguished from "not installed" on purpose: one is something the human
    // fixes with apt and the other is something they cannot, and a single
    // "clipboard failed" would send them to the wrong one.
    const failing: typeof CLIPBOARD_TOOLS = [
      { cmd: process.execPath, stdin: false, args: () => ['-e', 'process.exit(3)'] },
    ];
    const out = await copyImageToClipboard(DATA_URL, { platform: 'linux', tools: failing });
    assert.equal(out.ok, false);
    assert.match(out.error ?? '', /exited 3/);
    assert.doesNotMatch(out.error ?? '', /not installed/);
  });

  it('does not pretend to work on a platform it has no tool for', async () => {
    for (const platform of ['darwin', 'win32']) {
      const out = await copyImageToClipboard(DATA_URL, { platform, tools: STANDIN });
      assert.equal(out.ok, false);
      assert.match(out.error ?? '', new RegExp(platform), 'the refusal names the platform it is about');
    }
  });

  it('refuses a payload that is not a PNG without touching the disk', async () => {
    const before = await tmpClipFiles();
    const out = await copyImageToClipboard('data:text/html;base64,PGI+', { platform: 'linux', tools: STANDIN });
    assert.equal(out.ok, false);
    assert.deepEqual(await tmpClipFiles(), before, 'a refused payload still created a temp file');
  });

  it('leaves no temp file behind, whether it worked or not', async () => {
    // The file is written to hand xclip a path, and xclip holds the bytes rather
    // than re-reading it — so it is removed in a finally. One per copy, kept,
    // would be litter that accumulates for as long as the editor is open.
    const before = await tmpClipFiles();
    await copyImageToClipboard(DATA_URL, { platform: 'linux', tools: STANDIN });
    assert.deepEqual(await tmpClipFiles(), before);
  });
});

describe('missingToolMessage', () => {
  it('tells a Linux user the command to run', () => {
    const msg = missingToolMessage('linux');
    assert.match(msg, /xclip/);
    assert.match(msg, /install/i);
    // And says WHY the extension is asking a program to do this at all, because
    // "install xclip to copy an image" is a strange thing to be told with no
    // reason attached.
    assert.match(msg, /VS Code will not let a panel write an image/);
  });

  it('does not tell a Mac or Windows user to install a Linux tool', () => {
    for (const platform of ['darwin', 'win32']) {
      const msg = missingToolMessage(platform);
      assert.doesNotMatch(msg, /sudo apt/);
      assert.match(msg, new RegExp(platform));
    }
  });
});

async function tmpClipFiles(): Promise<string[]> {
  const names = await fs.readdir(os.tmpdir()).catch(() => [] as string[]);
  return names.filter((n) => n.startsWith('aboard-clip-')).sort();
}

describe('a tool that daemonises', () => {
  // The bug that shipped, reproduced without an X server and without touching
  // the machine's clipboard.
  //
  // xclip takes ownership of the X selection by FORKING: the foreground process
  // reads the image and exits 0 in about a millisecond, and a background process
  // stays alive to serve the selection — holding the stderr pipe it inherited.
  // Node's `close` fires on exit AND stdio EOF, so it never fired: the five-second
  // timeout reported a failure on a copy that had already succeeded, and the human
  // saw the fallback dialog with the image correctly on their clipboard behind it.
  // Reported 2026-08-28 as "I installed xclip and it still shows the modal".
  //
  // The stand-in does exactly that, so the TIME is the assertion: a `close`-based
  // implementation burns the whole budget and fails; this one answers at once.
  // wl-copy behaves the same way.
  it('is done when it EXITS, not when its child closes the pipes it inherited', async () => {
    const started = Date.now();
    const out = await copyImageToClipboard(DATA_URL, { platform: 'linux', tools: STANDIN });
    const took = Date.now() - started;

    assert.equal(out.ok, true, `the daemonising stand-in was not reported as done: ${out.error}`);
    assert.ok(
      took < TOOL_TIMEOUT_MS / 2,
      `it took ${took}ms of a ${TOOL_TIMEOUT_MS}ms budget — it is waiting for the daemon's pipes again`,
    );
  });

  it('still times out on a tool that genuinely wedges before exiting', async () => {
    // The timeout has to survive the fix. A tool that never exits at all is a
    // different thing from one that exits and leaves a child behind, and only
    // the first should hit the clock.
    const wedged: typeof CLIPBOARD_TOOLS = [
      { cmd: process.execPath, stdin: false, args: () => ['-e', `setTimeout(()=>{}, ${TOOL_TIMEOUT_MS * 3})`] },
    ];
    const out = await copyImageToClipboard(DATA_URL, { platform: 'linux', tools: wedged });
    assert.equal(out.ok, false);
    assert.match(out.error ?? '', /did not finish within/);
  });
});
