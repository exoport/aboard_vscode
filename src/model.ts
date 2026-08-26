// Document → what the tree shows, and the edits the human's actions make.
//
// Pure, and free of `vscode` on purpose: this is where every rule worth testing
// lives (icon precedence, badge count, tooltip text, what "dismiss" actually
// writes), and `tree.ts` is a thin translation of it into TreeItems.

import type { Capabilities, Doc, Edit, TabDoc } from './board';

export type DotKind = 'change' | 'removal' | undefined;

export interface TabItemModel {
  id: string;
  /** `tab.name`, or `(unnamed)` — the same words the board itself uses. */
  label: string;
  /** The id, because that is how tabs get referred to in prose and in chat. */
  description: string;
  /** Markdown: `bb71 · Kanban`, then the note verbatim. */
  tooltip: string;
  dot: DotKind;
  /** Drives the `when` clauses of the context menu. */
  contextValue: string;
  type: string;
}

/** Type → human label, from `/capabilities`. Never hardcoded here. */
export type TypeLabels = ReadonlyMap<string, string>;

export function typeLabels(caps: Capabilities | undefined): TypeLabels {
  const out = new Map<string, string>();
  for (const spec of caps?.types ?? []) {
    if (typeof spec?.type === 'string' && typeof spec.label === 'string') {
      out.set(spec.type, spec.label);
    }
  }
  return out;
}

function isMark(value: unknown): boolean {
  return typeof value === 'object' && value !== null;
}

/**
 * Which dot a tab gets.
 *
 * Removal wins over change, and it has to: a removal request is a question with
 * two answers and a change is a notification. A tab an agent asked to delete has
 * almost always been touched too, so "whichever came last" would hide the
 * question behind the notification most of the time.
 */
export function dotFor(tab: TabDoc): DotKind {
  if (isMark(tab.pendingRemoval)) {
    return 'removal';
  }
  if (isMark(tab.touched)) {
    return 'change';
  }
  return undefined;
}

export function tooltipFor(tab: TabDoc, labels: TypeLabels): string {
  const label = labels.get(tab.type) ?? tab.type;
  const lines = [`\`${tab.id}\` · ${label}`];
  if (typeof tab.note === 'string' && tab.note.trim() !== '') {
    // Verbatim, and second: it is what the tab is FOR, in the human's own words.
    lines.push('', tab.note.trim());
  }
  const removal = tab.pendingRemoval;
  if (isMark(removal)) {
    const by = removal?.by ? `\`${removal.by}\`` : 'an agent';
    lines.push('', `**Removal requested** by ${by}${removal?.reason ? `: ${removal.reason}` : ''}`);
  }
  const touched = tab.touched;
  if (isMark(touched)) {
    const by = touched?.by ? `\`${touched.by}\`` : 'an agent';
    lines.push('', `Changed by ${by}${touched?.at ? ` at ${touched.at}` : ''}${touched?.note ? ` — ${touched.note}` : ''}`);
  }
  return lines.join('\n');
}

export function contextValueFor(tab: TabDoc): string {
  // A dot-separated bag (`tab.removal.touched`), matched with a `=~` regex in
  // package.json — the dots are word boundaries, so `\btouched\b` matches one
  // element and never a prefix of another. VS Code's
  // `when` grammar has no set membership, so a bag plus `=~` is the shape that
  // lets one item carry two independent facts.
  const parts = ['tab'];
  if (isMark(tab.pendingRemoval)) {
    parts.push('removal');
  }
  if (isMark(tab.touched)) {
    parts.push('touched');
  }
  return parts.join('.');
}

/** Document order, always. Sorting it would be a lie about the board. */
export function tabItems(doc: Doc, labels: TypeLabels): TabItemModel[] {
  return (doc.tabs ?? []).map((tab) => ({
    id: tab.id,
    label: typeof tab.name === 'string' && tab.name.trim() !== '' ? tab.name : '(unnamed)',
    description: tab.id,
    tooltip: tooltipFor(tab, labels),
    dot: dotFor(tab),
    contextValue: contextValueFor(tab),
    type: tab.type,
  }));
}

/** `TreeView.badge`: how many tabs the human has not looked at yet. */
export function badgeCount(doc: Doc): number {
  return (doc.tabs ?? []).filter((t) => isMark(t.touched)).length;
}

/**
 * Schema drift, said out loud rather than guessed at.
 *
 * The comparison is `/capabilities`.schema against the document's `version` —
 * both read from the same running server — precisely so this extension does not
 * have to know a schema number. It owns no schema knowledge; it only notices
 * when the board is disagreeing with itself, which is what a mid-upgrade
 * restart looks like from out here.
 */
export function schemaMismatch(doc: Doc, caps: Capabilities | undefined): string | undefined {
  const declared = caps?.schema;
  const actual = doc.version;
  if (typeof declared !== 'number' || typeof actual !== 'number' || declared === actual) {
    return undefined;
  }
  return `This board's document is schema v${actual} and the server serving it reads v${declared}. The panel will show the board's own reload notice; the sidebar may be incomplete until they agree.`;
}

/** The deep link the board itself builds for "copy link to this tab". */
export function referenceFor(boardUrl: string, tabId: string, nodeId?: string): string {
  const base = boardUrl.replace(/#.*$/, '');
  return nodeId ? `${base}#tab=${tabId}&node=${nodeId}` : `${base}#tab=${tabId}`;
}

/**
 * The panel's iframe src.
 *
 * `?chrome=notabs` hides the board's own tab strip, which is §4 of
 * `handoff-board-for-vscode-panel.md` and has NOT landed on the aboard side yet.
 * It is sent anyway: an unknown query parameter is ignored by every version of
 * the shell, so the cost today is nothing and the day it lands this extension
 * needs no change. Until then the panel shows two tab strips and is otherwise
 * fully functional.
 *
 * Every value this returns starts with the no-tab form, and `media/panel.html`
 * relies on that: it accepts a `goto` only for a src beginning with the one the
 * frame was rendered with. The invariant is asserted in test/model.test.ts,
 * because it is load-bearing in a file no unit test can load.
 *
 * The `r` counter is not decoration. The board does not write the hash back when
 * the human switches tabs from inside it, so the URL can already read `#tab=bb71`
 * while the page shows something else — and setting a fragment to the value it
 * already has fires no `hashchange`, so the click would do nothing.
 */
export function frameSrc(boardUrl: string, tabId: string | undefined, nonce: number): string {
  const base = boardUrl.replace(/#.*$/, '');
  const sep = base.includes('?') ? '&' : '?';
  const url = `${base}${sep}chrome=notabs`;
  return tabId ? `${url}#tab=${encodeURIComponent(tabId)}&r=${nonce}` : url;
}

/* --------------------------------------------------------------- the edits */

function findTab(doc: Doc, id: string): TabDoc | undefined {
  return (doc.tabs ?? []).find((t) => t.id === id);
}

/**
 * Dismiss a change marker.
 *
 * This is the whole reason the extension writes as `__by: "human"`. An agent
 * write that drops `touched` has the previous marker carried forward by the
 * server, silently and with a 200 — so getting the actor wrong turns this
 * command into a no-op that reports success.
 */
export function dismissChange(id: string): Edit {
  return (doc) => {
    const tab = findTab(doc, id);
    if (!tab || tab.touched === undefined || tab.touched === null) {
      return false;
    }
    delete tab.touched;
    return true;
  };
}

/** Answer a removal request with yes: the tab goes. */
export function approveRemoval(id: string): Edit {
  return (doc) => {
    const before = doc.tabs.length;
    doc.tabs = doc.tabs.filter((t) => t.id !== id);
    return doc.tabs.length !== before;
  };
}

/** Answer a removal request with no: the tab stays and the request goes. */
export function denyRemoval(id: string): Edit {
  return (doc) => {
    const tab = findTab(doc, id);
    if (!tab || tab.pendingRemoval === undefined || tab.pendingRemoval === null) {
      return false;
    }
    delete tab.pendingRemoval;
    return true;
  };
}

export function renameTab(id: string, name: string): Edit {
  return (doc) => {
    const tab = findTab(doc, id);
    if (!tab || tab.name === name) {
      return false;
    }
    tab.name = name;
    return true;
  };
}

/** An empty note removes the field rather than storing "", as the board does. */
export function setNote(id: string, note: string): Edit {
  return (doc) => {
    const tab = findTab(doc, id);
    if (!tab) {
      return false;
    }
    const trimmed = note.trim();
    if (trimmed === '') {
      if (tab.note === undefined) {
        return false;
      }
      delete tab.note;
      return true;
    }
    if (tab.note === trimmed) {
      return false;
    }
    tab.note = trimmed;
    return true;
  };
}
