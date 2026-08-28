// Putting a PNG on the system clipboard, which a webview cannot do.
//
// The board's markup renderer copies a cropped region as an image. In a browser
// it uses `navigator.clipboard.write` and that is the end of it. In here it is
// refused — Chromium blocks the Clipboard API "because of a permissions policy
// applied to the current document", the webview holds that policy, and VS Code
// exposes no way to change it: `WebviewOptions` has no permission field and
// `vscode.env.clipboard` is `readText`/`writeText`, text only.
//
// So the extension host does it, because the extension host is Node and can run
// a program. This file is that program call and nothing else.
//
// It is this repository's FIRST platform-specific code and its first dependency
// on a binary outside VS Code, which is why it is one small file with the
// reasoning in it rather than a few lines hidden in panel.ts. Asked for
// explicitly by the human on 2026-08-28.

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/** What happened, in the words the human will read. */
export interface ClipboardOutcome {
  ok: boolean;
  /** Absent when ok. A sentence, not a stack. */
  error?: string;
  /** Which program did it, for the status line. */
  tool?: string;
}

/**
 * The candidates, in order, and why there are two.
 *
 * `xclip` is the X11 one and is what was asked for. `wl-copy` is the Wayland
 * equivalent, tried second because a Wayland session usually has XWayland and
 * `xclip` usually still works — but not always, and the failure when it does not
 * is a hang rather than an error. Trying the native one after it costs nothing.
 *
 * Neither exists on macOS or Windows. That is stated rather than papered over:
 * a wrong guess about the platform would be a copy that silently does nothing,
 * which is the whole class of defect this feature keeps producing.
 */
export const CLIPBOARD_TOOLS: ReadonlyArray<{
  cmd: string;
  args: (file: string) => string[];
  /** wl-copy takes the image on stdin; xclip takes a path. */
  stdin: boolean;
}> = [
  { cmd: 'xclip', stdin: false, args: (f) => ['-selection', 'clipboard', '-t', 'image/png', '-i', f] },
  { cmd: 'wl-copy', stdin: true, args: () => ['--type', 'image/png'] },
];

/** How long a clipboard tool gets before it is assumed wedged. */
export const TOOL_TIMEOUT_MS = 5000;

/** The largest PNG this will move, so a runaway page cannot fill /tmp. */
export const MAX_BYTES = 24 * 1024 * 1024;

/**
 * The instruction shown when there is no tool. Exported so the message the human
 * reads and the list actually tried cannot drift apart.
 */
export function missingToolMessage(platform: string): string {
  if (platform !== 'linux') {
    return 'Copying an image to the clipboard from a VS Code panel needs a helper program, '
      + `and this extension only knows the Linux ones (xclip, wl-copy). On ${platform} the picture below is the way out.`;
  }
  return 'VS Code will not let a panel write an image to the clipboard, so this extension '
    + 'asks xclip to do it — and xclip is not installed. Install it with '
    + '`sudo apt install xclip` (or `wl-clipboard` on Wayland) and this button will work. '
    + 'Until then, the picture below is the way out.';
}

/** Decode the `data:image/png;base64,...` the board sends. */
export function decodePng(dataUrl: unknown): Buffer | undefined {
  if (typeof dataUrl !== 'string') {
    return undefined;
  }
  const prefix = 'data:image/png;base64,';
  if (!dataUrl.startsWith(prefix)) {
    return undefined;
  }
  const body = dataUrl.slice(prefix.length);
  // Base64 is 4 characters per 3 bytes, so the encoded length bounds the decoded
  // one — checked BEFORE decoding, or the allocation this limit exists to
  // prevent has already happened.
  if (body.length / 4 * 3 > MAX_BYTES) {
    return undefined;
  }
  const buf = Buffer.from(body, 'base64');
  // A PNG starts with these eight bytes. Checked because this buffer is about to
  // be written to disk and handed to another program: "the page said it was a
  // PNG" is not the same as "it is one".
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (buf.length < magic.length || magic.some((b, i) => buf[i] !== b)) {
    return undefined;
  }
  return buf;
}

/** Run one tool against one file. Resolves rather than throws: every path is an outcome. */
function runTool(
  tool: (typeof CLIPBOARD_TOOLS)[number],
  file: string,
  data: Buffer,
): Promise<ClipboardOutcome> {
  return new Promise((resolve) => {
    let child;
    try {
      // No shell. The only variable here is a path this process just made, but a
      // shell would make that a question worth asking every time this file is
      // read, and it never has to be.
      child = spawn(tool.cmd, tool.args(file), { stdio: ['pipe', 'ignore', 'pipe'] });
    } catch (err) {
      resolve({ ok: false, error: String(err) });
      return;
    }
    let stderr = '';
    let settled = false;
    const done = (outcome: ClipboardOutcome) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    const timer = setTimeout(() => {
      child.kill();
      done({ ok: false, error: `${tool.cmd} did not finish within ${TOOL_TIMEOUT_MS}ms` });
    }, TOOL_TIMEOUT_MS);

    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk).slice(0, 500);
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      // ENOENT is the ordinary case — the tool is simply not installed — and it
      // is the one the human can act on, so it is named rather than reported as
      // a spawn failure.
      done({ ok: false, error: err.code === 'ENOENT' ? `${tool.cmd} is not installed` : String(err) });
    });
    child.on('close', (code) => {
      if (code === 0) {
        done({ ok: true, tool: tool.cmd });
        return;
      }
      done({ ok: false, error: `${tool.cmd} exited ${code}${stderr ? ': ' + stderr.trim() : ''}` });
    });

    // Writing to a stdin the child has already closed throws, and xclip closes
    // it, so the error is swallowed rather than becoming a spurious failure for
    // a tool that actually worked.
    child.stdin?.on('error', () => {});
    child.stdin?.end(tool.stdin ? data : undefined);
  });
}

/**
 * Put a PNG on the system clipboard, or say why not.
 *
 * The temp file is removed whatever happens. `xclip` daemonises to keep serving
 * the selection after this returns, and it re-reads nothing — it holds the bytes
 * — so deleting the file underneath it is safe and leaving it would be litter
 * that accumulates once per copy.
 */
export async function copyImageToClipboard(
  dataUrl: unknown,
  platform: string = process.platform,
): Promise<ClipboardOutcome> {
  const png = decodePng(dataUrl);
  if (!png) {
    return { ok: false, error: 'that was not a PNG this extension is willing to write' };
  }
  if (platform !== 'linux') {
    return { ok: false, error: missingToolMessage(platform) };
  }

  const file = path.join(os.tmpdir(), `aboard-clip-${process.pid}-${Date.now()}.png`);
  try {
    await fs.writeFile(file, png, { mode: 0o600 });
  } catch (err) {
    return { ok: false, error: `could not write a temporary file: ${String(err)}` };
  }

  try {
    let lastError = '';
    for (const tool of CLIPBOARD_TOOLS) {
      const outcome = await runTool(tool, file, png);
      if (outcome.ok) {
        return outcome;
      }
      lastError = outcome.error ?? '';
      // A tool that exists and refused is a real failure and worth reporting as
      // itself; only "not installed" is worth moving past.
      if (!lastError.includes('is not installed')) {
        return outcome;
      }
    }
    return { ok: false, error: missingToolMessage(platform) };
  } finally {
    await fs.rm(file, { force: true }).catch(() => {});
  }
}
