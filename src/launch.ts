import * as fs from 'node:fs';
import * as path from 'node:path';

// Choosing the "start the board" command. Pure: the PATH probe is injected, so
// the decision is testable and the decision is the part that has a rule.

export interface OnPath {
  aboard: boolean;
  ape: boolean;
}

export type StartChoice =
  | { ok: true; command: string; args: string[]; display: string }
  | { ok: false; message: string };

/**
 * Pick the command, never guess it.
 *
 * `aboard` wins when both are present: it is the dedicated binary, and the whole
 * HTTP contract this extension is written against is `aboard`'s. `ape aboard`
 * exists for projects that standardise on `ape` for everything, and is the right
 * answer only when it is the one that is there. (Plan-1 states no preference
 * between the two — this is the extension's choice, recorded here and in
 * docs/handoff.md §6 rather than left implicit in an `if`.)
 *
 * Neither on PATH is an ERROR naming both, not a silent nothing: an empty tree
 * with no explanation is the worst version of this, and the human is one
 * install away from a working board.
 *
 * There is no force-restart flag to reach for, deliberately — `aboard serve`
 * refuses to start beside this project's own board, so the wrong outcome here is
 * a message, not two servers.
 */
export function chooseStartCommand(onPath: OnPath): StartChoice {
  if (onPath.aboard) {
    return { ok: true, command: 'aboard', args: ['serve'], display: 'aboard serve' };
  }
  if (onPath.ape) {
    return { ok: true, command: 'ape', args: ['aboard', 'serve'], display: 'ape aboard serve' };
  }
  return {
    ok: false,
    message: 'No board binary found on PATH. Install `aboard` (then `aboard serve`) or `ape` (then `ape aboard serve`), and try again.',
  };
}

/** Does an executable of this name exist on PATH? Injectable, so it is testable. */
export function isOnPath(
  name: string,
  env: NodeJS.ProcessEnv = process.env,
  isExecutable: (p: string) => boolean = defaultIsExecutable,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const pathVar = env.PATH ?? env.Path ?? '';
  if (pathVar === '') {
    return false;
  }
  const windows = platform === 'win32';
  const separator = windows ? ';' : ':';
  const extensions = windows ? (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';') : [''];
  // The platform is a PARAMETER, so the joiner has to be chosen from it too:
  // `path.join` is whatever the process is running on, which would build
  // `C:\tools/aboard.EXE` when this is asked about Windows from anywhere else.
  const join = windows ? path.win32.join : path.posix.join;
  for (const dir of pathVar.split(separator)) {
    if (dir === '') {
      continue;
    }
    for (const ext of extensions) {
      if (isExecutable(join(dir, name + ext))) {
        return true;
      }
    }
  }
  return false;
}

function defaultIsExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK);
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}
