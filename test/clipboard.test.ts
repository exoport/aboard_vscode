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
  it('says what to install, on the platform it can help with', async () => {
    const out = await copyImageToClipboard(DATA_URL, 'linux');
    // Either a tool was there and it worked, or it was not and the message names
    // it. Both are correct; what must never happen is a bare failure.
    if (!out.ok) {
      assert.match(out.error ?? '', /xclip/, 'a Linux failure has to name the program to install');
    } else {
      assert.ok(CLIPBOARD_TOOLS.some((t) => t.cmd === out.tool), `copied with an unknown tool ${out.tool}`);
    }
  });

  it('does not pretend to work on a platform it has no tool for', async () => {
    for (const platform of ['darwin', 'win32']) {
      const out = await copyImageToClipboard(DATA_URL, platform);
      assert.equal(out.ok, false);
      assert.match(out.error ?? '', new RegExp(platform), 'the refusal names the platform it is about');
    }
  });

  it('refuses a payload that is not a PNG without touching the disk', async () => {
    const before = await tmpClipFiles();
    const out = await copyImageToClipboard('data:text/html;base64,PGI+', 'linux');
    assert.equal(out.ok, false);
    assert.deepEqual(await tmpClipFiles(), before, 'a refused payload still created a temp file');
  });

  it('leaves no temp file behind, whether it worked or not', async () => {
    // The file is written to hand xclip a path, and xclip holds the bytes rather
    // than re-reading it — so it is removed in a finally. One per copy, kept,
    // would be litter that accumulates for as long as the editor is open.
    const before = await tmpClipFiles();
    await copyImageToClipboard(DATA_URL, 'linux');
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

describe('the real clipboard tool', () => {
  // The one case that needs an actual binary, and the one that shipped broken.
  //
  // xclip takes the X selection by FORKING: the foreground process exits 0 in
  // about a millisecond and a background process stays alive to serve it, holding
  // the stderr pipe it inherited. Listening for Node's `close` — exit AND stdio
  // EOF — therefore never fired, the five-second timeout reported a failure, and
  // the human saw the fallback dialog with the image correctly on their clipboard
  // behind it. Reported 2026-08-28 as "I installed xclip and it still shows the
  // modal". wl-copy behaves the same way.
  //
  // So the TIME is the assertion. A `close`-based implementation takes the whole
  // timeout and fails; this one answers in milliseconds.
  it('answers in milliseconds, not when a forked daemon closes its pipes', async () => {
    if (process.platform !== 'linux') {
      console.log(`[clipboard] SKIPPED: ${process.platform} has no tool this extension knows`);
      return;
    }
    const started = Date.now();
    const out = await copyImageToClipboard(DATA_URL, 'linux');
    const took = Date.now() - started;

    // Loud, never silent — the same posture as the integration test. A machine
    // with no tool or no display cannot answer this, and must say which.
    if (!out.ok && /is not installed/.test(out.error ?? '')) {
      console.log('[clipboard] SKIPPED: no xclip or wl-copy here — install one and this case runs');
      return;
    }
    if (!out.ok && /display|DISPLAY/i.test(out.error ?? '')) {
      console.log(`[clipboard] SKIPPED: a tool is installed but there is no display (${out.error})`);
      return;
    }

    assert.equal(out.ok, true, `a clipboard tool is present and the copy failed: ${out.error}`);
    assert.ok(CLIPBOARD_TOOLS.some((t) => t.cmd === out.tool), `copied with an unknown tool ${out.tool}`);
    assert.ok(
      took < TOOL_TIMEOUT_MS / 2,
      `the copy took ${took}ms of a ${TOOL_TIMEOUT_MS}ms budget — it is waiting for the daemon's pipes again`,
    );
  });
});
