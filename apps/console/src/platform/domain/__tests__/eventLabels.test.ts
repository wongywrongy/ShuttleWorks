/**
 * V3-PE04.1: the console and entrant tiers each keep their own copy of the
 * approved event/discipline labels ("Men's singles", not "Mens Singles" or
 * "Men's Singles"). Two copies drift silently unless something reads one
 * off disk and checks it against the other — this test is that check.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { EVENT_LABEL_MAP } from '../eventLabels';

function readEntrantEventLabelMap(): Record<string, string> {
  const filePath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../../../entrant/app/lib/eventLabels.ts',
  );
  const source = readFileSync(filePath, 'utf8');
  // Only the `EVENT_LABEL_MAP` object literal, not the surrounding doc
  // comment or helper functions — a comment can legitimately contain
  // "word: 'quoted text'"-shaped prose that would otherwise parse as a
  // spurious extra entry.
  const declStart = source.indexOf('EVENT_LABEL_MAP');
  const objectStart = source.indexOf('{', declStart);
  const objectEnd = source.indexOf('});', objectStart);
  const body = source.slice(objectStart, objectEnd);
  const out: Record<string, string> = {};
  // Quote-aware: a label legitimately contains an apostrophe ("Men's
  // singles"), so the value alternates double- vs single-quoted rather than
  // stopping at the first quote character of either kind.
  const entry = /(\w+):\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = entry.exec(body))) {
    out[match[1]] = match[2] ?? match[3];
  }
  return out;
}

describe('console and entrant event labels stay identical', () => {
  it('the console map is non-empty and sentence-cased', () => {
    expect(Object.keys(EVENT_LABEL_MAP).length).toBeGreaterThan(0);
    for (const label of Object.values(EVENT_LABEL_MAP)) {
      // "Men's singles" — capital only on the first letter, not each word.
      expect(label).not.toMatch(/\b[A-Z][a-z]*\b.*\b[A-Z][a-z]*\b/);
    }
  });

  it('matches the entrant lib EVENT_LABEL_MAP key-for-key, read from disk', () => {
    const entrantLabels = readEntrantEventLabelMap();
    expect(entrantLabels).toEqual(EVENT_LABEL_MAP);
  });
});
