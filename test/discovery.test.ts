// The discovery walk, against a real temp directory tree.
//
// A fake filesystem would have passed while the real one failed on the thing
// that actually matters here — walking UP, and resolving symlinks so the
// `project` comparison can succeed.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { after, describe, it } from 'node:test';

import { findAllInstances, findInstances, findProjectRoot, instanceFileName, samePath } from '../src/board';

const temps: string[] = [];

function tmp(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aboard-vscode-'));
  temps.push(dir);
  return fs.realpathSync(dir);
}

function seed(root: string, name = 'instance.json', body: unknown = undefined): string {
  const runDir = path.join(root, '.aboard', 'run');
  fs.mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, name);
  fs.writeFileSync(
    file,
    JSON.stringify(body ?? { app: 'aboard', project: root, port: 41234, url: `http://127.0.0.1:41234/`, state: 'x', pid: 1 }),
  );
  return file;
}

after(() => {
  for (const dir of temps) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('findProjectRoot', () => {
  it('walks up from a subdirectory to the folder holding .aboard', () => {
    const root = tmp();
    seed(root);
    const deep = path.join(root, 'a', 'b', 'c');
    fs.mkdirSync(deep, { recursive: true });
    assert.equal(findProjectRoot(deep), root);
  });

  it('returns undefined when no ancestor has one', () => {
    const root = tmp();
    const deep = path.join(root, 'x');
    fs.mkdirSync(deep);
    // /tmp itself has no .aboard, and the walk stops at the filesystem root.
    assert.equal(findProjectRoot(deep), undefined);
  });

  it('resolves symlinks, because /health reports the resolved path', () => {
    const root = tmp();
    seed(root);
    const link = path.join(tmp(), 'link');
    fs.symlinkSync(root, link, 'dir');
    assert.equal(findProjectRoot(link), root);
  });

  it('takes the NEAREST .aboard when a project is nested inside another', () => {
    const outer = tmp();
    seed(outer);
    const inner = path.join(outer, 'sub');
    fs.mkdirSync(inner);
    seed(inner);
    assert.equal(findProjectRoot(inner), inner);
  });
});

describe('instanceFileName', () => {
  it('accepts the default and named records, and nothing else', () => {
    assert.equal(instanceFileName('instance.json'), '');
    assert.equal(instanceFileName('instance.review.json'), 'review');
    assert.equal(instanceFileName('journal.jsonl'), undefined);
    assert.equal(instanceFileName('instance.json.bak'), undefined);
  });
});

describe('findInstances', () => {
  it('finds the record from a nested starting directory', () => {
    const root = tmp();
    const file = seed(root);
    const deep = path.join(root, 'pkg', 'thing');
    fs.mkdirSync(deep, { recursive: true });
    const found = findInstances(deep);
    assert.equal(found.length, 1);
    assert.equal(found[0]!.instanceFile, file);
    assert.equal(found[0]!.projectRoot, root);
    assert.equal(found[0]!.instance.port, 41234);
  });

  it('finds named boards beside the default one', () => {
    const root = tmp();
    seed(root);
    seed(root, 'instance.review.json', { app: 'aboard', project: root, name: 'review', port: 41999 });
    const found = findInstances(root);
    assert.deepEqual(
      found.map((c) => c.instance.port).sort(),
      [41234, 41999],
    );
  });

  it('skips an unreadable or half-written record instead of failing', () => {
    const root = tmp();
    seed(root);
    fs.writeFileSync(path.join(root, '.aboard', 'run', 'instance.broken.json'), '{ "app": "abo');
    const found = findInstances(root);
    assert.equal(found.length, 1);
  });

  it('skips a record with no port — it cannot be talked to', () => {
    const root = tmp();
    seed(root, 'instance.json', { app: 'aboard', project: root });
    assert.deepEqual(findInstances(root), []);
  });

  it('returns nothing for a folder with no .aboard at all', () => {
    assert.deepEqual(findInstances(tmp()), []);
  });
});

describe('findAllInstances', () => {
  it('lists one board per project across a multi-root workspace', () => {
    const a = tmp();
    const b = tmp();
    seed(a);
    seed(b, 'instance.json', { app: 'aboard', project: b, port: 41567 });
    const found = findAllInstances([a, b]);
    assert.deepEqual(found.map((c) => c.projectRoot).sort(), [a, b].sort());
  });

  it('does not count one project twice when two folders sit under it', () => {
    const root = tmp();
    seed(root);
    const one = path.join(root, 'one');
    const two = path.join(root, 'two');
    fs.mkdirSync(one);
    fs.mkdirSync(two);
    assert.equal(findAllInstances([one, two]).length, 1);
  });

  it('has nothing to say about an empty workspace', () => {
    assert.deepEqual(findAllInstances([]), []);
  });
});

describe('samePath', () => {
  it('ignores a trailing separator', () => {
    assert.ok(samePath('/a/b', '/a/b/'));
    assert.ok(!samePath('/a/b', '/a/c'));
  });
});

describe('a board name with a dot in it', () => {
  // `boardNameRe` in pkg/aboard/layout.go allows dots, so `--name v1.2` writes
  // `instance.v1.2.json`. A `[^.]+` name segment skipped it: the board was
  // running and answering, and the tree showed nothing and said nothing.
  // Reproduced against a real `aboard serve --name v1.2` before this was fixed.
  it('is a board, not a file to skip', () => {
    assert.equal(instanceFileName('instance.v1.2.json'), 'v1.2');
    assert.equal(instanceFileName('instance.json'), '');
    assert.equal(instanceFileName('instance.review.json'), 'review');
  });

  it('is not confused with the other files in run/', () => {
    assert.equal(instanceFileName('journal.jsonl'), undefined);
    assert.equal(instanceFileName('instance.json.tmp'), undefined);
    assert.equal(instanceFileName('shots'), undefined);
  });

  it('is discovered beside the default board', () => {
    const root = tmp();
    const run = path.join(root, '.aboard', 'run');
    fs.mkdirSync(run, { recursive: true });
    const record = (name: string, port: number) =>
      fs.writeFileSync(path.join(run, name), JSON.stringify({ app: 'aboard', project: root, port }));
    record('instance.json', 41001);
    record('instance.v1.2.json', 41002);
    assert.deepEqual(
      findInstances(root).map((c) => path.basename(c.instanceFile)),
      ['instance.json', 'instance.v1.2.json'],
    );
  });
});
