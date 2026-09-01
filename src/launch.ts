import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Choosing the "start the board" command. Pure: every probe is injected, so the
// decision is testable and the decision is the part that has a rule.

export interface StartInputs {
  /** The dedicated `aboard` binary is on PATH. */
  aboard: boolean;
  /**
   * `ape aboard` exists AND answers. Not "ape is on PATH": ape only grew the
   * mount in v0.0.55, and every ape before that is on PATH, is perfectly real,
   * and does not have the subcommand. See hasApeAboard.
   */
  apeAboard: boolean;
  /** The project this board would serve has an `_apex/` directory. */
  apexProject: boolean;
}

export type StartChoice =
  | { ok: true; command: string; args: string[]; display: string }
  | { ok: false; message: string };

const ABOARD: StartChoice = { ok: true, command: 'aboard', args: ['serve'], display: 'aboard serve' };
const APE_ABOARD: StartChoice = { ok: true, command: 'ape', args: ['aboard', 'serve'], display: 'ape aboard serve' };

/**
 * Pick the command, never guess it.
 *
 * Both hosts drive the same `.aboard/`, so when both are usable the choice is
 * about the PROJECT rather than about the binaries: a project with an `_apex/`
 * directory is an APEX project, whose sessions run through `ape`, and starting
 * its board with `ape aboard serve` keeps one toolchain in the terminal the
 * human is looking at. A project without one has no reason to reach through
 * ape, so the dedicated binary wins.
 *
 * That reverses an earlier judgement call ("`aboard` always wins when both are
 * present"), which was made before there was any signal to tell the two kinds
 * of project apart. `_apex/` is that signal. Recorded here and in
 * `docs/reference/discovery-and-start.md`, "Starting a board" — change both or
 * they drift.
 *
 * Whichever is preferred, only what is actually THERE is offered: the `_apex/`
 * rule breaks a tie, it never picks a binary the machine does not have.
 *
 * Neither available is an ERROR naming both, not a silent nothing: an empty
 * tree with no explanation is the worst version of this, and the human is one
 * install away from a working board.
 *
 * There is no force-restart flag to reach for, deliberately — `aboard serve`
 * refuses to start beside this project's own board, so the wrong outcome here is
 * a message, not two servers.
 */
export function chooseStartCommand(inputs: StartInputs): StartChoice {
  if (inputs.aboard && inputs.apeAboard) {
    return inputs.apexProject ? APE_ABOARD : ABOARD;
  }
  if (inputs.aboard) {
    return ABOARD;
  }
  if (inputs.apeAboard) {
    return APE_ABOARD;
  }
  return {
    ok: false,
    message: 'No board binary found on PATH. Install `aboard` (then `aboard serve`) or `ape` (then `ape aboard serve`), and try again.',
  };
}

/**
 * Does `ape` have the board mounted?
 *
 * Presence on PATH is not the question, and asking it was a real defect: `ape`
 * only grew `ape aboard` in v0.0.55, so on a machine with an older one the
 * extension offered a command that does not exist, the terminal answered
 * `unknown command "aboard"`, and the poll then reported "no board answered
 * within 10s" — which names the symptom and not one word of the cause.
 *
 * So it is asked rather than assumed, with the cheapest thing that can only
 * succeed if the subcommand is really there. Exit status alone is the verdict:
 * the version string belongs to aboard, and parsing it would couple this to a
 * format neither repo promises.
 */
export function hasApeAboard(run: (cmd: string, args: string[]) => void = defaultRun): boolean {
  try {
    run('ape', ['aboard', '--version']);
    return true;
  } catch {
    return false;
  }
}

function defaultRun(cmd: string, args: string[]): void {
  // One exec, on the start path only, and bounded: a hung binary must not hang
  // the button. stdio is ignored so nothing lands in the user's output.
  execFileSync(cmd, args, { stdio: 'ignore', timeout: 5_000 });
}

/**
 * Is this an APEX project? One directory, no walk-up.
 *
 * The board is started IN this directory, so this asks about the same place the
 * command will run. `ape` itself climbs for `_apex/config.yaml`, but a rule the
 * human cannot check by looking at the folder they opened is a rule that
 * surprises them.
 */
export function isApexProject(root: string, io: { isDirectory(p: string): boolean } = realDirs): boolean {
  // Total by construction: an unreadable path is "not an APEX project", not an
  // exception out of the start button. The guarantee lives here rather than in
  // realDirs so it holds for any io, injected ones included.
  try {
    return io.isDirectory(path.join(root, '_apex'));
  } catch {
    return false;
  }
}

const realDirs = {
  isDirectory(p: string): boolean {
    return fs.statSync(p).isDirectory();
  },
};

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
